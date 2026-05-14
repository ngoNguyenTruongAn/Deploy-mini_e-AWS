# W5 Milestone Path Selection & Justification

Tài liệu này giải thích các path kiến trúc được lựa chọn cho từng milestone trong W5, lý do lựa chọn, trade-off, và lý do không chọn các phương án thay thế. Mục tiêu là không chỉ hoàn thành yêu cầu kỹ thuật, mà còn thể hiện tư duy thiết kế hệ thống cloud theo hướng bảo mật, dễ kiểm chứng, có khả năng mở rộng và phù hợp với phạm vi workshop.

---

## MH1 — Multi-VPC Connectivity

### Path đã chọn

**Path A — Sử dụng VPC Peering để kết nối App VPC và Database VPC.**

### Kiến trúc triển khai

Hệ thống được tách thành 2 VPC chính:

| Layer | VPC | CIDR | Vai trò |
|---|---|---|---|
| Application Layer | `minie-app` | `10.0.0.0/16` | Chứa ALB, ECS backend, EFS, public/private subnets |
| Database Layer | `minie-db` | `10.1.0.0/16` | Chứa RDS MySQL và Redis/Valkey trong private subnets |

Hai VPC được kết nối bằng VPC Peering:

```text
minie-app VPC 10.0.0.0/16
        ↓ VPC Peering
minie-db VPC 10.1.0.0/16
```

Route 2 chiều được cấu hình:

```text
App VPC private route tables:
10.1.0.0/16 → VPC Peering Connection

DB VPC private route tables:
10.0.0.0/16 → VPC Peering Connection
```

Kết nối được kiểm chứng bằng VPC Flow Logs ở cả hai phía:

- App VPC Flow Logs ghi nhận traffic từ ECS backend sang RDS MySQL port `3306`.
- Database VPC Flow Logs ghi nhận request từ App VPC và response từ Database VPC quay lại App VPC.
- Các dòng log đều có trạng thái `ACCEPT OK`.

### Lý do chọn 2 VPC thay vì 1 VPC

Em chọn 2 VPC thay vì đặt toàn bộ resource trong một VPC để thể hiện rõ mô hình **network segmentation** giữa application layer và database layer.

Trong mô hình 1 VPC, ALB, ECS, RDS, Redis và các thành phần khác có thể được tách bằng subnet và security group. Tuy nhiên, tất cả vẫn nằm trong cùng một network boundary. Với mô hình 2 VPC, database layer được cô lập mạnh hơn ở cấp network. App VPC chỉ có thể truy cập Database VPC thông qua VPC Peering, route table và security group rule được kiểm soát rõ ràng.

Lý do cụ thể:

1. **Tăng isolation giữa application và database**
   - App VPC chứa workload xử lý request như ALB và ECS.
   - Database VPC chỉ chứa stateful services như RDS MySQL và Redis/Valkey.
   - Database VPC không có public subnet và database không public ra Internet.

2. **Áp dụng nguyên tắc least privilege ở network layer**
   - App VPC chỉ được route sang `10.1.0.0/16` qua VPC Peering.
   - Security group của RDS chỉ mở port cần thiết như `3306`.
   - Security group của Redis chỉ mở port cần thiết như `6379`.
   - Không mở database trực tiếp cho Internet.

3. **Dễ chứng minh yêu cầu Multi-VPC Connectivity**
   - MH1 yêu cầu chứng minh kết nối giữa nhiều VPC.
   - Với 2 VPC, có thể dùng route table, security group và VPC Flow Logs để chứng minh traffic private cross-VPC.
   - Evidence rõ ràng hơn so với mô hình 1 VPC.

4. **Phù hợp với tư duy production-like architecture**
   - Trong môi trường thực tế, application layer và database layer thường được tách boundary để giảm blast radius.
   - Nếu application layer bị cấu hình sai hoặc bị tấn công, database vẫn nằm trong VPC riêng và chỉ nhận traffic theo rule đã định nghĩa.

### Trade-off về chi phí và vận hành

Thiết kế 2 VPC có lợi về bảo mật và khả năng chứng minh kiến trúc, nhưng cũng có một số trade-off:

1. **VPC bản thân không tính phí**, nhưng các thành phần đi kèm có thể phát sinh chi phí.
2. **VPC Flow Logs** ghi vào CloudWatch Logs có thể phát sinh chi phí lưu trữ log.
3. **Data transfer qua VPC Peering** có thể phát sinh chi phí, đặc biệt nếu traffic lớn hoặc đi cross-AZ.
4. **Vận hành phức tạp hơn 1 VPC** vì cần quản lý route table 2 chiều, peering connection và security group cross-VPC.
5. Nếu route hoặc SG cấu hình sai, lỗi kết nối DB sẽ khó debug hơn so với 1 VPC.

Tuy nhiên, trong phạm vi W5, lợi ích về segmentation, security và evidence cho multi-VPC lớn hơn chi phí phát sinh nhỏ của workshop.

### Vì sao không chọn Transit Gateway

Transit Gateway phù hợp cho mô hình nhiều VPC, nhiều account, hoặc hub-and-spoke network ở quy mô lớn. Nếu hệ thống có nhiều VPC như App, DB, Shared Services, Security, Logging, Analytics, hoặc có nhiều AWS accounts, Transit Gateway là lựa chọn tốt hơn để quản lý routing tập trung.

Tuy nhiên, trong bài này chỉ có 2 VPC chính. Nếu dùng Transit Gateway thì sẽ:

- Tăng độ phức tạp.
- Tăng chi phí.
- Không cần thiết cho phạm vi 2 VPC.
- Làm evidence khó hơn so với VPC Peering.

Vì vậy, VPC Peering là lựa chọn cân bằng hơn giữa simplicity, cost và requirement.

### Vì sao không chọn PrivateLink

PrivateLink phù hợp khi muốn expose một service cụ thể qua endpoint, thường dùng cho service provider/consumer model. PrivateLink không phải lựa chọn tự nhiên để kết nối ECS backend tới RDS/Redis trong một VPC khác.

Trong bài này backend cần kết nối private tới database layer theo IP/network path. Vì vậy VPC Peering phù hợp hơn PrivateLink.

---

## MH2 — Network Firewall

### Trạng thái

**Không hoàn thành do giới hạn tài khoản AWS workshop/free tier.**

### Lý do

Khi triển khai AWS Network Firewall, tài khoản gặp lỗi subscription/quyền sử dụng dịch vụ. Vì vậy MH2 không thể hoàn thành trong môi trường hiện tại.

Các milestone còn lại gồm MH1, MH3, MH4 và MH5 đã được triển khai và kiểm chứng bằng evidence thực tế.

### Ghi chú kiến trúc

Nếu tài khoản hỗ trợ Network Firewall, path phù hợp sẽ là đặt firewall endpoints vào dedicated firewall subnets trong App VPC, sau đó cập nhật route table để traffic outbound hoặc east-west traffic đi qua firewall endpoint. Tuy nhiên, do giới hạn account, phần này được ghi nhận là constraint của môi trường, không phải lỗi thiết kế.

---

## MH3 — File Storage Layer + Backup Plan

### Path đã chọn

**Amazon EFS + AWS Backup + Restore Test.**

### Kiến trúc triển khai

File storage layer được triển khai bằng Amazon EFS:

```text
ECS Fargate backend
        ↓ mount NFS
Amazon EFS efs-minie-shared
        ↓ protected by
AWS Backup Plan
        ↓ restore test
Restored EFS efs-minie-shared-restore-test-v2
```

Các thành phần chính:

| Thành phần | Tên / Giá trị | Vai trò |
|---|---|---|
| Primary file system | `efs-minie-shared` | Shared file storage cho backend |
| ECS mount path | `/mnt/minie-shared` | Container path để ghi/đọc file |
| Test file | `mh3-test.txt` | File chứng minh EFS hoạt động |
| Backup vault | `minie-w5-backup-vault` | Nơi lưu recovery points |
| Backup plan | `minie-w5-backup-plan` | Lịch backup daily, retention 7 ngày |
| Restore target | `efs-minie-shared-restore-test-v2` | EFS mới được restore từ recovery point |
| Restore mount path | `/mnt/minie-restore` | Container path để đọc dữ liệu restored |

Backup plan bao phủ 3 loại stateful resources:

| Resource type | Resource | Lý do |
|---|---|---|
| File system | EFS | Shared file storage |
| Database | RDS MySQL | Database state |
| Block storage | EBS test volume | Đại diện cho block storage state |

### Lý do chọn Amazon EFS

Amazon EFS phù hợp với ECS Fargate vì EFS là managed NFS file system, có thể mount trực tiếp vào container. Với ứng dụng backend chạy nhiều task, EFS cho phép các task cùng truy cập một shared filesystem mà không cần quản lý server lưu file riêng.

Lý do cụ thể:

1. **Tương thích tốt với ECS Fargate**
   - ECS task có thể mount EFS qua task definition.
   - Không cần quản lý EC2 instance riêng để làm file server.

2. **Shared filesystem**
   - Nhiều ECS task có thể cùng truy cập một file system.
   - Phù hợp với use case cần lưu file dùng chung hoặc dữ liệu runtime có tính chia sẻ.

3. **Managed service**
   - AWS quản lý availability và durability của file system.
   - Giảm effort vận hành so với tự dựng NFS server.

4. **Tích hợp tốt với AWS Backup**
   - EFS có thể được backup bằng AWS Backup.
   - Có thể restore recovery point sang file system mới để kiểm chứng dữ liệu.

### Vì sao không chọn EBS làm file storage chính

EBS là block storage, thường gắn với EC2 instance hoặc workload trong một AZ. EBS không phải shared filesystem mặc định cho nhiều ECS Fargate task.

Nếu dùng EBS làm file storage chính thì sẽ gặp các hạn chế:

- Không phù hợp để nhiều Fargate task mount đồng thời như shared filesystem.
- Có tính AZ-bound, không linh hoạt bằng EFS cho multi-AZ container workloads.
- Phù hợp hơn cho block-level storage của EC2 hoặc stateful workload cụ thể.

Trong bài này, EBS được tạo để đại diện cho block storage state trong backup plan, chứ không dùng làm file storage chính.

### Vì sao không chỉ dùng S3

S3 là object storage, rất phù hợp để lưu ảnh, file tĩnh hoặc media object. Tuy nhiên, MH3 yêu cầu file storage layer có thể được gắn vào workload và test backup/restore theo kiểu filesystem. EFS phù hợp hơn vì container có thể mount và thao tác bằng file path như:

```text
/mnt/minie-shared/mh3-test.txt
```

S3 vẫn được sử dụng trong hệ thống cho frontend bucket và media bucket, nhưng với MH3, EFS là lựa chọn phù hợp hơn để chứng minh shared filesystem layer.

### Vì sao phải làm Restore Test

Một backup job có trạng thái `Completed` chỉ chứng minh backup đã chạy xong. Nó chưa chứng minh dữ liệu có thể khôi phục được.

Restore test là bước quan trọng vì nó chứng minh:

1. Recovery point có thể tạo lại resource mới.
2. Restored EFS có thể mount vào ECS.
3. Dữ liệu thật trong file system có thể đọc lại được.
4. Quy trình backup không chỉ tồn tại trên giấy mà có thể dùng khi xảy ra sự cố.

Vì vậy, MH3 không dừng ở backup plan mà thực hiện restore sang EFS mới, mount vào ECS và đọc lại file test.

---

## MH4 — API Gateway trước Lambda

### Path đã chọn

**REST API Gateway + Lambda Proxy Integration + API Key + Usage Plan.**

### Kiến trúc triển khai

```text
Backend ECS / curl client
        ↓ HTTP POST + x-api-key
API Gateway REST API
        ↓ Lambda Proxy Integration
Lambda lambda-minie-media-metadata
        ↓ PutItem
DynamoDB minie-media-metadata
```

Các thành phần chính:

| Thành phần | Giá trị |
|---|---|
| API Gateway | `api-minie-media` |
| API type | REST API |
| Route | `POST /media/metadata` |
| Stage | `prod` |
| Auth mechanism | API Key |
| Throttling | Usage Plan, rate `5 rps`, burst `10` |
| Lambda | `lambda-minie-media-metadata` |
| Database | DynamoDB `minie-media-metadata` |
| App integration | Backend ECS gọi API Gateway khi seller tạo product có ảnh |

### Lý do chọn REST API Gateway

REST API Gateway phù hợp vì nó hỗ trợ rõ ràng các yêu cầu cần chứng minh trong bài:

- Lambda Proxy Integration.
- API Key Required ở method level.
- Usage Plan.
- Throttling.
- Test `curl` có key trả `200`.
- Test `curl` không key trả `403`.

REST API giúp evidence rõ ràng hơn vì các thành phần API Key và Usage Plan được thể hiện trực tiếp trong Console.

### Lý do chọn API Key + Usage Plan

API Key được chọn vì đây là cơ chế đơn giản, dễ kiểm chứng và phù hợp với use case backend-to-API Gateway trong phạm vi workshop.

Evidence rất rõ:

```text
Request có x-api-key     → HTTP 200
Request không có x-api-key → HTTP 403 Forbidden
```

Usage Plan được dùng để giới hạn traffic vào API Gateway trước khi request tới Lambda:

```text
Rate: 5 requests/second
Burst: 10 requests
```

Điều này giúp API Gateway đóng vai trò như một control layer phía trước Lambda, thay vì để client gọi Lambda trực tiếp.

### Vì sao không chọn Cognito

Cognito phù hợp với authentication cho end-user trong production, ví dụ login người dùng, quản lý user pool, token, federation với social identity provider.

Tuy nhiên, trong bài này use case là backend gửi metadata ảnh tới Lambda thông qua API Gateway. Đây không phải flow user login trực tiếp. Nếu dùng Cognito thì sẽ cần cấu hình thêm User Pool, App Client, token flow và logic xác thực JWT, làm tăng đáng kể độ phức tạp so với yêu cầu.

Vì vậy, API Key là lựa chọn hợp lý hơn cho phạm vi workshop.

### Vì sao không chọn Lambda Authorizer

Lambda Authorizer linh hoạt hơn API Key vì có thể viết logic custom để validate token, signature hoặc policy. Nhưng đổi lại cần tạo thêm authorizer function, viết policy response, debug IAM policy và tích hợp với API Gateway.

Với mục tiêu của bài là chứng minh API Gateway đứng trước Lambda, có authentication và có throttling, API Key + Usage Plan đã đáp ứng đủ và dễ kiểm chứng hơn.

### Vì sao không gọi Lambda trực tiếp

Nếu backend invoke Lambda trực tiếp, API Gateway sẽ không còn vai trò bảo vệ phía trước Lambda. Khi đó sẽ thiếu:

- API endpoint chuẩn hóa.
- Authentication layer bằng API Key.
- Usage Plan throttling.
- Evidence `403 Forbidden` khi request không có key.

Vì vậy backend được cập nhật để gọi API Gateway endpoint:

```text
POST /prod/media/metadata
```

Backend gửi metadata ảnh với header:

```text
x-api-key: <API_KEY_VALUE>
```

Sau đó API Gateway mới invoke Lambda. Đây là flow đúng với yêu cầu MH4.

---

## MH5 — Serverless Scaling Pattern

### Path đã chọn

**S3 Event Triggered Lambda Pattern.**

### Kiến trúc triển khai

```text
S3 bucket media-s3-minie
        ↓ ObjectCreated event, prefix products/
Lambda lambda-minie-media-metadata
        ↓ PutItem
DynamoDB minie-media-metadata
```

Các thành phần chính:

| Thành phần | Giá trị |
|---|---|
| Event source | S3 ObjectCreated |
| Bucket | `media-s3-minie` |
| Prefix | `products/` |
| Lambda | `lambda-minie-media-metadata` |
| Output | DynamoDB `minie-media-metadata` |
| Test object | `products/ALB.jpg` |

### Lý do chọn S3 Event Triggered Lambda

Pattern này phù hợp nhất với ứng dụng Mini E vì hệ thống có media bucket để lưu file/ảnh sản phẩm. Khi có file mới được upload vào `products/`, S3 tự động phát sinh event và trigger Lambda xử lý metadata.

Lý do cụ thể:

1. **Phù hợp với domain của ứng dụng**
   - Mini E có media/product images.
   - File upload là sự kiện tự nhiên trong hệ thống.
   - Metadata ảnh có thể được xử lý bất đồng bộ sau khi file xuất hiện.

2. **Event-driven và serverless**
   - Không cần backend polling S3.
   - Không cần cron job hoặc worker chạy nền.
   - Lambda chỉ chạy khi có event, phù hợp với serverless scaling.

3. **Tự động scale theo số lượng object events**
   - Khi nhiều file được upload, S3 có thể trigger nhiều Lambda invocations.
   - Đây là scaling pattern tự nhiên của serverless event processing.

4. **Dễ kiểm chứng bằng evidence**
   - CloudWatch Logs có `eventSource: aws:s3`.
   - Lambda logs có `DynamoDB PutItem succeeded`.
   - DynamoDB có item chứa `bucketName`, `objectKey`, `objectSize`, `eventName`.

5. **Tái sử dụng Lambda thật của MH4**
   - Không tạo Lambda giả chỉ để làm milestone.
   - Lambda `lambda-minie-media-metadata` vừa xử lý API Gateway event ở MH4, vừa xử lý S3 event ở MH5.
   - Điều này thể hiện function được mở rộng để hỗ trợ nhiều event source thực tế.

### Vì sao không chọn Reserved Concurrency

Ban đầu em đã thử chọn Reserved Concurrency để giới hạn concurrency của Lambda và tạo throttle behavior. Tuy nhiên, tài khoản AWS workshop/free tier không cho cấu hình reserved concurrency do giới hạn unreserved account concurrency. Khi nhập reserved concurrency, AWS báo không thể làm unreserved account concurrency thấp hơn ngưỡng yêu cầu.

Vì không thể tạo evidence throttle hợp lệ trong môi trường này, em không chọn Reserved Concurrency.

### Vì sao không chọn Provisioned Concurrency

Provisioned Concurrency phù hợp khi cần giảm cold start cho Lambda có traffic ổn định hoặc yêu cầu latency nghiêm ngặt. Tuy nhiên:

- Function metadata này nhẹ, không có yêu cầu latency nghiêm ngặt.
- Provisioned Concurrency có thể phát sinh chi phí vì phải giữ execution environment luôn sẵn sàng.
- Với workshop, mục tiêu là chứng minh scaling pattern dễ quan sát, nên S3 event trigger phù hợp hơn.

### Vì sao không chọn Async Invocation + DLQ

Async Invocation + DLQ phù hợp khi cần xử lý lỗi, retry và dead-letter cho các event không xử lý thành công. Đây là pattern tốt cho reliability, nhưng trong bài này use case media upload phù hợp trực tiếp với S3 ObjectCreated event hơn.

Nếu dùng DLQ, cần thêm SQS/SNS, cấu hình failure destination và tạo lỗi có chủ đích để kiểm chứng. Điều đó phức tạp hơn trong khi không phản ánh rõ bằng S3 event-driven flow của ứng dụng.

### Kết luận MH5

S3 Event Triggered Lambda là lựa chọn phù hợp nhất cho hệ thống Mini E vì nó gắn trực tiếp với media upload workflow, dùng Lambda thật trong ứng dụng, thể hiện event-driven scaling rõ ràng và có evidence trực quan từ CloudWatch Logs và DynamoDB.
