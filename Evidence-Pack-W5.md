# 📦 Evidence Pack — W5 Mini E AWS Deployment

> **Project:** Mini E E-commerce  
> **Region:** `ap-southeast-1` (Singapore)  
> **Domain:** `minie-ecommercehoangdeptraisieucaovutru.software`

---

## 📋 Mục lục

| # | Milestone | Path chọn |
|---|---|---|
| MH1 | Multi-VPC Connectivity | VPC Peering + Route Table 2 chiều + Flow Logs |
| MH2 | Network Firewall | — |
| MH3 | File Storage Layer + Backup Plan | EFS + AWS Backup + Restore Test |
| MH4 | API Gateway trước Lambda | REST API + Lambda Proxy + DynamoDB |
| MH5 | Serverless Scaling Pattern | S3 Event Triggered Lambda |

---

## MH1 — Multi-VPC Connectivity

### Kiến trúc triển khai

Hệ thống được tách thành 2 VPC chính:

| Layer | VPC | CIDR | Vai trò |
|---|---|---|---|
| Application Layer | `minie-app` | `10.0.0.0/16` | Chứa ALB, ECS backend, EFS, public/private subnets |
| Database Layer | `minie-db` | `10.1.0.0/16` | Chứa RDS MySQL và Redis/Valkey trong private subnets |

Hai VPC được kết nối bằng VPC Peering:

Route 2 chiều được cấu hình:

```text
App VPC private route tables:
10.1.0.0/16 → VPC Peering Connection

DB VPC private route tables:
10.0.0.0/16 → VPC Peering Connection
```

### Lý do chọn 2 VPC thay vì 1 VPC
- Em chọn 2 VPC thay vì đặt toàn bộ resource trong một VPC để thể hiện rõ mô hình **network segmentation** giữa application layer và database layer.
- Trong mô hình 1 VPC, ALB, ECS, RDS, Redis và các thành phần khác có thể được tách bằng subnet và security group. Tuy nhiên, tất cả vẫn nằm trong cùng một network boundary. Với mô hình 2 VPC, database layer được cô lập mạnh hơn ở cấp network. App VPC chỉ có thể truy cập Database VPC thông qua VPC Peering, route table và security group rule được kiểm soát rõ ràng.
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

## Trade-off về chi phí và vận hành

Thiết kế 2 VPC có lợi về bảo mật và khả năng chứng minh kiến trúc, nhưng cũng có một số trade-off:

1. **VPC bản thân không tính phí**, nhưng các thành phần đi kèm có thể phát sinh chi phí.
2. **VPC Flow Logs** ghi vào CloudWatch Logs có thể phát sinh chi phí lưu trữ log.
3. **Data transfer qua VPC Peering** có thể phát sinh chi phí, đặc biệt nếu traffic lớn hoặc đi cross-AZ.
4. **Vận hành phức tạp hơn 1 VPC** vì cần quản lý route table 2 chiều, peering connection và security group cross-VPC.
5. Nếu route hoặc SG cấu hình sai, lỗi kết nối DB sẽ khó debug hơn so với 1 VPC.
- Tuy nhiên, trong phạm vi W5, lợi ích về segmentation, security và evidence cho multi-VPC lớn hơn chi phí phát sinh nhỏ

### Vì sao không chọn Transit Gateway
- Transit Gateway phù hợp cho mô hình nhiều VPC, nhiều account, hoặc hub-and-spoke network ở quy mô lớn. Nếu hệ thống có nhiều VPC như App, DB, Shared Services, Security, Logging, Analytics, hoặc có nhiều AWS accounts, Transit Gateway là lựa chọn tốt hơn để quản lý routing tập trung.
- Tuy nhiên, trong bài này chỉ có 2 VPC chính. Nếu dùng Transit Gateway thì sẽ:
  - Tăng độ phức tạp.
  - Tăng chi phí.
  - Không cần thiết cho phạm vi 2 VPC.
  - Làm evidence khó hơn so với VPC Peering.
- Vì vậy, VPC Peering là lựa chọn cân bằng hơn giữa simplicity, cost và requirement.

### Vì sao không chọn PrivateLink
- PrivateLink phù hợp khi muốn expose một service cụ thể qua endpoint, thường dùng cho service provider/consumer model. PrivateLink không phải lựa chọn tự nhiên để kết nối ECS backend tới RDS/Redis trong một VPC khác.
- Trong bài này backend cần kết nối private tới database layer theo IP/network path. Vì vậy VPC Peering phù hợp hơn PrivateLink.

## 1 Tạo VPC Peering Connection
- VPC → Peering connections → Create peering connection
- Chọn: 
Name: peering-app-to-db
VPC ID requester: chọn minie-app / vpc-app / 10.0.0.0/16
Account: My account
Region: This region ap-southeast-1
VPC ID accepter: chọn minie-db / vpc-db / 10.1.0.0/16
-> Click Create peering connection
- Sau đó accept: Actions → Accept request → Accept request
![VPC Peering Connection](./evidence-W5/VPC%20Peering%20Connection.jpg)

## 2 Cập nhật Route Tables 2 chiều
- Vào VPC → Route tables
**Chiều 1: VPC App → VPC Database:**
- Tìm route table đang associate với app-vpc-app-a và app-vpc-app-b
![associate Route Tables](./evidence-W5/associate%20Route%20Tables.jpg)
- Với mỗi route table của app private subnet, thêm route:
  - Destination: 10.1.0.0/16
  - Target: Peering Connection -> pcx-071abb39c28d5aeb3 (id của Peering Connection vừa tạo)
![Done associate-1](./evidence-W5/Done%20associate-1.jpg)
**Chiều 2: VPC Database → VPC App:**
- Tìm route table đang associate với db-vpc-db-a và db-vpc-db-b
![associate Route Tables-2](./evidence-W5/associate%20Route%20Tables-2.jpg)
- Với mỗi route table của app private subnet, thêm route:
  - Destination: 10.0.0.0/16
  - Target: Peering Connection -> pcx-071abb39c28d5aeb3 (id của Peering Connection vừa tạo)
![Done associate-2](./evidence-W5/Done%20associate-2.jpg)

## 3 Tạo Security Groups

## 3.1 Tạo Security Groups trong VPC App
 **Tạo SG cho ALB:**
- EC2 → Security Groups → Create security group
- Chọn như sau: 
  - Security group name: alb-minie
  - Description: Allow HTTP/HTTPS from Internet
  - VPC: minie-app / vpc-app
  - Inbound rules như sau: 
![SG ALB](./evidence-W5/SG%20ALB.jpg)
  - Outbound: All traffic → 0.0.0.0/0
 **SG cho ECS Backend:**
- Chọn như sau: 
  - Security group name: ecs-minie
  - Description: Allow backend traffic from ALB
  - VPC: minie-app / vpc-app
  - Inbound và Outbound rules như sau: 
![ECS ALB](./evidence-W5/ECS%20ALB.jpg)
 **Tạo SG cho EFS**
- Chọn như sau: 
  - Security group name: efs-minie
  - Description: Allow NFS from ECS
  - VPC: minie-app / vpc-app
  - Inbound và Outbound rules như sau: 
![SG EFS](./evidence-W5/SG%20EFS.jpg)

## 3.2 Tạo Security Groups trong VPC DB
 **Tạo SG cho RDS MySQL**
- Chọn như sau: 
  - Security group name: rds-minie
  - Description: Allow MySQL from App VPC via Peering
  - VPC: minie-db / vpc-db
  - Inbound và Outbound rules như sau: 
![SG RDS MySQL](./evidence-W5/SG%20RDS%20MySQL.jpg)
 **Tạo SG cho Redis / Valkey**
- Chọn như sau: 
  - Security group name: redis-minie
  - Description: Allow Redis from App VPC via Peering
  - VPC: minie-db / vpc-db
  - Inbound và Outbound rules như sau: 
![SG Redis](./evidence-W5/SG%20Redis.jpg)

## 4.Tạo Flow Logs
- Flow Logs cho VPC App:
  - VPC → Your VPCs → minie-app
  - Flow logs → Create flow log
  - Cấu hình:
  - Name: flowlog-vpc-app
  - Filter: All
  - Maximum aggregation interval: 1 minute
  - Destination: Send to CloudWatch Logs
  - Log group: /vpc/minie-app-flowlogs
![Flow Logs App](./evidence-W5/Flow%20Logs%20App.jpg)
- Flow Logs cho VPC Database:
  - VPC → Your VPCs → minie-db
  - Flow logs → Create flow log
  - Cấu hình:
  - Name: flowlog-vpc-db
  - Filter: All
  - Maximum aggregation interval: 1 minute
  - Destination: Send to CloudWatch Logs
  - Log group: /vpc/minie-db-flowlogs
![Flow Logs Db](./evidence-W5/Flow%20Logs%20Db.jpg)


## Evidence Flow Logs: App VPC → Database VPC
- Dùng CloudWatch Logs Insights trên log group: /vpc/minie-app-flowlogs
- Query: 
fields @timestamp, @message
| filter @message like /10\.1\./
| filter @message like /3306/
| filter @message like /ACCEPT/
| sort @timestamp desc
| limit 50
![Kq Flow Logs app](./evidence-W5/Kq%20Flow%20Logs%20app.jpg)
*Ý nghĩa:*
- 10.0.143.228: ECS/App trong VPC App
- 10.1.137.132: RDS MySQL trong VPC Database
- 3306: MySQL port
- ACCEPT OK: Traffic được route và security group cho phép
 ## Evidence Flow Logs: Database VPC nhận traffic từ App VPC
 - Dùng CloudWatch Logs Insights trên log group: /vpc/minie-db-flowlogs
 - Query:
fields @timestamp, @message
| filter @message like /10\.0\./
| filter @message like /3306/
| filter @message like /ACCEPT/
| sort @timestamp desc
| limit 50
![Kq Flow Logs db](./evidence-W5/Kq%20Flow%20Logs%20db.jpg)
- Kết quả ghi nhận traffic:
  - 10.0.143.228 → 10.1.137.132  36380 → 3306  ACCEPT OK
  - 10.1.137.132 → 10.0.143.228  3306 → 36380  ACCEPT OK
- Ý nghĩa:
  - Dòng thứ nhất là request từ App VPC sang RDS MySQL trong Database VPC.
  - Dòng thứ hai là response từ RDS MySQL quay lại ECS backend trong App VPC.
  - Cả hai dòng đều có ACCEPT OK, chứng minh route table và security group cho phép traffic 2 chiều.

## Evidence ALB → ECS trong VPC App
![ALB to ECS](./evidence-W5/ALB%20to%20ECS.jpg)



---

## MH2 — Network Firewall

### Path đã chọn

**Path A — AWS Network Firewall (Stateful Domain Allowlist + Alert Logs)**

### Kiến trúc triển khai

ECS tasks trong private subnet kết nối ra internet (Cloudinary, Twilio, SMTP) qua NAT Gateway. AWS Network Firewall được đặt giữa NAT Gateway và Internet Gateway để kiểm soát và ghi log mọi egress traffic.

```text
ECS (private subnet)
        ↓
NAT Gateway (public subnet)
        ↓
Network Firewall Endpoint (firewall subnet)
        ↓
Internet Gateway
        ↓
Internet
```

### Các thành phần chính

| Thành phần | Tên / Giá trị | Vai trò |
|---|---|---|
| Firewall | `minie-network-firewall` | Inspection point giữa NAT GW và IGW |
| Firewall Policy | `minie-fw-policy` | Container chứa rule groups |
| Stateful Rule Group | `minie-fw-stateful-rules` | Domain-based egress allowlist |
| Firewall Subnet AZ-a | `firewall-subnet-a` / `10.0.32.0/24` | Nơi đặt firewall endpoint AZ-a |
| Firewall Subnet AZ-b | `firewall-subnet-b` / `10.0.33.0/24` | Nơi đặt firewall endpoint AZ-b |
| Alert Logs | `/aws/network-firewall/alert` | CloudWatch log group ghi request bị chặn |
| Flow Logs | `/aws/network-firewall/flow` | CloudWatch log group ghi mọi traffic |

### Lý do chọn Path A — AWS Network Firewall

ECS backend cần kết nối ra internet để gọi các third-party services:

- **Cloudinary** — upload/transform ảnh sản phẩm
- **Twilio** — gửi SMS OTP
- **SMTP Gmail** — gửi email xác nhận đơn hàng

Vì có NAT Gateway phục vụ egress traffic, theo yêu cầu W5, **Path A là bắt buộc**. Network Firewall cho phép:

1. **Stateful inspection** — kiểm tra packet theo domain, không chỉ IP/port
2. **Domain allowlist** — chỉ cho phép traffic đến các domain được cấp phép
3. **Alert Logs** — ghi lại mọi request bị DROP để làm evidence
4. **Centralized enforcement** — một điểm kiểm soát toàn bộ egress traffic

### Vì sao không chọn Path B — Hardened SG + NACL

Path B chỉ hợp lệ khi **không có NAT Gateway** và toàn bộ AWS service access qua VPC Endpoint. Trong stack này ECS cần gọi Cloudinary, Twilio, SMTP — đây là external internet endpoints không thể thay thế bằng VPC Endpoint. Vì vậy, NAT Gateway là bắt buộc → Path A là bắt buộc.

---

## MH2-A — Quy hoạch Firewall Subnets (Network Hardening)

Để triển khai Firewall theo mô hình **Hub-and-Spoke**, tôi tạo 2 Subnet riêng biệt dành riêng cho Firewall Endpoints, đảm bảo tách bạch luồng traffic và dễ dàng quản lý Route Table.

- **VPC**: `minie-app-vpc`
- **Subnets**:
  | Subnet Name | Availability Zone | CIDR Block | Ghi chú |
  |---|---|---|---|
  | `firewall-subnet-a` | `us-east-1a` | `10.0.32.0/24` | Chứa Endpoint AZ-a |
  | `firewall-subnet-b` | `us-east-1b` | `10.0.33.0/24` | Chứa Endpoint AZ-b |

![Firewall Subnets](./evidence-W5/Firewall%20Subnets.jpg)

---

## MH2-B — Cấu hình Stateful Rule Group (Egress Filtering)

Sử dụng cơ chế **Domain List** để thiết lập "Allowlist" cho các kết nối ra ngoài Internet (Egress). Chỉ những domain cần thiết cho vận hành ứng dụng mới được phép đi qua.

- **Name**: `minie-fw-stateful-rules`
- **Capacity**: 100
- **Action**: `ALLOW`
- **Domain List**:
  - `.amazonaws.com` (AWS Services)
  - `.cloudinary.com` (Image Storage)
  - `.vnpayment.vn` (Payment Gateway)
  - `.twilio.com` (SMS Service)
  - `.google.com` & `.gmail.com` (SMTP Server)

![Stateful Rule Group](./evidence-W5/Stateful%20Rule%20Group.png)

---

## MH2-C — Thiết lập Firewall Policy & Strict Order

Cấu hình Policy để áp dụng Rule Group và thiết lập hành động mặc định là `DROP` đối với các request không nằm trong danh sách trắng.

- **Policy Name**: `minie-fw-policy`
- **Rule Order**: **Strict Order** (Đảm bảo các quy tắc được kiểm tra theo thứ tự ưu tiên).
- **Stateful Default Action**: `Drop Established` & `Alert Established` (Chặn và ghi log mọi traffic lạ).

![Firewall Policy](./evidence-W5/Firewall%20Policy.png)

---

## MH2-D — Triển khai Network Firewall Instance

Triển khai Firewall tại tầng mạng của VPC, gắn các Endpoint vào Firewall Subnets đã tạo ở bước A.

- **Firewall Name**: `minie-network-firewall`
- **Deployment**: Multi-AZ (1a & 1b) để đảm bảo High Availability (HA).
- **Status**: `Ready` (Sau ~3-5 phút khởi tạo).

![Network Firewall](./evidence-W5/Network%20Firewall.png)

---

## MH2-E — Cấu hình Centralized Logging (CloudWatch)

Kích hoạt lưu trữ Log để phục vụ việc giám sát và xử lý sự cố (Troubleshooting).

- **Alert Logs**: Ghi lại các sự kiện bị chặn (DROP). Lưu tại `/aws/network-firewall/alert`.
- **Flow Logs**: Ghi lại toàn bộ luồng traffic đi qua firewall. Lưu tại `/aws/network-firewall/flow`.

![Firewall Logging](./evidence-W5/Firewall%20Logging.png)

---

## MH2-F — Tái cấu trúc Route Tables (Routing Design)

Đây là bước quan trọng nhất để "ép" traffic đi qua Firewall trước khi ra Internet hoặc quay lại hệ thống.

### 1. Firewall Subnets RT (Public Ingress)
Điều hướng traffic từ Firewall Subnet đi trực tiếp ra Internet qua IGW.
| Destination | Target |
|---|---|
| `0.0.0.0/0` | `Internet Gateway` |

### 2. Public Subnets RT (Egress Traffic)
Toàn bộ traffic từ NAT Gateway (chứa backend traffic) phải trỏ về Firewall Endpoint thay vì IGW.
| Destination | Target | Ghi chú |
|---|---|---|
| `0.0.0.0/0` | `vpce-xxxxxx (Firewall Endpoint)` | **Inspection Point** |

### 3. Edge Route Table (Ingress Traffic - Inbound)
Gắn vào **Internet Gateway** để điều hướng traffic quay về từ Internet đi qua Firewall trước khi vào NAT Gateway.
| Destination | Target |
|---|---|
| `10.0.128.0/20` | `vpce-xxxxxx (AZ-a)` |
| `10.0.144.0/20` | `vpce-xxxxxx (AZ-b)` |

![Route Table Firewall](./evidence-W5/Route%20Table%20Firewall.png)

---

## Evidence MH2: Kiểm thử tính đúng đắn của Firewall

### Case 1: Request hợp lệ (Cloudinary - Trong Allowlist)
Thực hiện từ ECS Backend Task (hoặc Jump Host trong Private Subnet):
```bash
# Vì container không có curl, dùng node để test
node -e "require('https').get('https://www.google.com', (res) => console.log('Status Code:', res.statusCode))"
```
- **Kết quả**: `Status Code: 200`.
- **Phân tích**: Firewall nhận diện SNI là `.google.com` (nằm trong Allowlist) và cho phép traffic đi qua.

![Firewall Allow Request](./evidence-W5/Firewall%20Allow%20Request.png)

### Case 2: Request bị chặn (Domain lạ - Ngoài Allowlist)
```bash
# Test domain không có trong allowlist
node -e "const req = require('https').get('https://vnexpress.net', (res) => console.log(res.statusCode)); req.on('error', (e) => console.log('Blocked:', e.message)); req.setTimeout(5000, () => { console.log('Timeout - Blocked by Firewall'); process.exit() })"
```
- **Kết quả**: `Timeout - Blocked by Firewall`.
- **Phân tích**: Firewall không tìm thấy `vnexpress.net` trong danh sách ALLOW, thực hiện hành động `DROP`.
- **Log Verification**: Kiểm tra log `/aws/network-firewall/alert` thấy xuất hiện bản ghi `DROP` với source là IP của Backend.

![Firewall Block Alert](./evidence-W5/Firewall%20Allow%20Request.png)

---

## MH3 — File Storage Layer + Backup Plan

### Path đã chọn

**Amazon EFS + AWS Backup + Restore Test.**


### Kiến trúc triển khai
File storage layer được triển khai bằng Amazon EFS:
(Vẽ sơ đồ ở đây)


## Các thành phần chính:
| Thành phần | Tên / Giá trị | Vai trò |
|---|---|---|
| Primary file system | `efs-minie-shared` | Shared file storage cho backend |
| ECS mount path | `/mnt/minie-shared` | Container path để ghi/đọc file |
| Test file | `mh3-test.txt` | File chứng minh EFS hoạt động |
| Backup vault | `minie-w5-backup-vault` | Nơi lưu recovery points |
| Backup plan | `minie-w5-backup-plan` | Lịch backup daily, retention 7 ngày |
| Restore target | `efs-minie-shared-restore-test-v2` | EFS mới được restore từ recovery point |
| Restore mount path | `/mnt/minie-restore` | Container path để đọc dữ liệu restored |

## Backup plan bao phủ 3 loại stateful resources:
| Resource type | Resource | Lý do |
|---|---|---|
| File system | EFS | Shared file storage |
| Database | RDS MySQL | Database state |
| Block storage | EBS test volume | Đại diện cho block storage state |

### Lý do chọn Amazon EFS
**Amazon EFS phù hợp với ECS Fargate vì EFS là managed NFS file system, có thể mount trực tiếp vào container. Với ứng dụng backend chạy nhiều task, EFS cho phép các task cùng truy cập một shared filesystem mà không cần quản lý server lưu file riêng.**
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


---

## MH3-A — Tạo EFS File System
- EFS → File systems → Create file system
- Chọn: Name: efs-minie-shared
- Cấu hình:
  - File system type: Regional
  - Performance mode: General Purpose
  - Throughput mode: Bursting
  - Lifecycle management: Optional / default
  - Encryption: Enable encryption
- Network access:
  - VPC: minie-app
  - Mount targets:
- ap-southeast-1a → app-vpc-app-a
- ap-southeast-1b → app-vpc-app-b
  - Security group: sg-efs-minie
![EFS File System](./evidence-W5/EFS%20File%20System.jpg)


---

## MH3-B — Tạo Access Point cho ECS
- Vào EFS vừa tạo: EFS → efs-minie-shared → Access points → Create access point
- Điền:
  - Name: ap-minie-shared
  - Root directory path: /minie-shared
- POSIX user:
  - User ID: 1000
  - Group ID: 1000
- Root directory creation permissions:
  - Owner user ID: 1000
  - Owner group ID: 1000
  - Permissions: 755
![Access Point](./evidence-W5/Access%20Point.jpg)


---

## MH3-C — Gắn EFS vào ECS Task Definition
- Vào: ECS → Task definitions → minie-backend-task → Create new revision
- Tìm phần Volumes, thêm volume:
Volume name: minie-shared-efs
Volume type: EFS
File system ID: efs-minie-shared / fs-xxxxxxxx
Transit encryption: Enabled
Authorization config:
Access point ID: fsap-xxxxxxxx
IAM: Enabled
Root directory: /
- Sau đó vào container minie-backend, phần Mount points:
  - Source volume: minie-shared-efs
  - Container path: /mnt/minie-shared
  - Read only: false
![EFS Task Definition](./evidence-W5/EFS%20Task%20Definition.jpg)



---

## MH3-D — Bật ECS Exec để kiểm tra EFS trong container
- Vì ECS Fargate không SSH trực tiếp vào máy được, em sử dụng ECS Exec để vào container backend.
- Vào ECS → Clusters → cluster-minie-prod → Services → svc-minie-backend → Update
- Ở phần Troubleshooting configuration, bật:
    - Turn on ECS Exec
- Chọn:
    - Force new deployment
- Click Update service.
Sau khi task mới RUNNING, kiểm tra ECS Exec bằng AWS CLI:
```powershell
aws ecs list-tasks `
  --cluster cluster-minie-prod `
  --service-name svc-minie-backend `
  --region ap-southeast-1
```
- Sau đó kiểm tra task có bật ExecuteCommandAgent hay chưa:
aws ecs describe-tasks `
  --cluster cluster-minie-prod `
  --tasks <TASK_ARN> `
  --region ap-southeast-1 `
  --query "tasks[0].{lastStatus:lastStatus,enableExecuteCommand:enableExecuteCommand,managedAgents:containers[0].managedAgents}"

- Nếu máy local chưa có Session Manager Plugin thì cài bằng winget:
```powershell
winget search "Session Manager Plugin"
winget install Amazon.SessionManagerPlugin
```


---

## MH3-E — Test ghi và đọc file trên EFS gốc
- Sau khi ECS Exec đã hoạt động, vào container backend bằng lệnh: 
```powershell
aws ecs execute-command `
  --cluster cluster-minie-prod `
  --task <TASK_ARN> `
  --container minie-backend `
  --interactive `
  --command "/bin/sh" `
  --region ap-southeast-1
```
- Trong container, kiểm tra mount path EFS:
ls -la /mnt
ls -la /mnt/minie-shared
- Tạo file test trên EFS:
echo "Mini E shared file test - W5 MH3" > /mnt/minie-shared/mh3-test.txt
cat /mnt/minie-shared/mh3-test.txt
- Kết quả: 
![EFS trong container](./evidence-W5/EFS%20trong%20container.jpg)
**Điều này chứng minh ECS backend trong private subnet đã mount thành công EFS shared file system và có thể ghi/đọc dữ liệu dùng chung.**



---

## MH3-F — Tạo Backup Vault
- Vào AWS Backup → Backup vaults → Create backup vault
Cấu hình:
  - Backup vault name: minie-w5-backup-vault
  - Encryption key: Default AWS Backup vault key
- Click Create backup vault.
![Backup Vault-1](./evidence-W5/Backup%20Vault-1.jpg)


---

## MH3-G — Tạo EBS Volume test cho Backup Plan
- Theo yêu cầu MH3, backup plan phải bao trùm ít nhất 3 loại resource có state:
  - File system: EFS
  - Database: RDS
  - Block storage: EBS
- Vì stack hiện tại không có EC2/EBS volume dùng trực tiếp cho application, em tạo một EBS volume nhỏ để đưa vào backup plan evidence.
- Vào EC2 → Elastic Block Store → Volumes → Create volume
- Cấu hình:
  - Volume type: gp3
  - Size: 1 GiB
  - Availability Zone: ap-southeast-1a
  - Name tag: ebs-minie-w5-backup-test
- Click Create volume.
![volume-1](./evidence-W5/volume-1.jpg)


---

## MH3-H — Tạo Backup Plan
- Vào AWS Backup → Backup plans → Create backup plan
- Chọn:
  - Build a new plan
- Cấu hình: Backup plan name: minie-w5-backup-plan
- Backup rule:
  - Backup rule name: daily-7days-retention
  - Backup vault: minie-w5-backup-vault
  - Backup frequency: Daily
  - Backup window: Default
  - Retention period: 7 days
- Click Create plan.
![Backup Plan](./evidence-W5/Backup%20Plan.jpg)


---

## MH3-I — Assign Resources vào Backup Plan
- Trong backup plan minie-w5-backup-plan, chọn Assign resources.
- Cấu hình:
  - Resource assignment name: minie-w5-stateful-resources
  - IAM role: AWSBackupDefaultServiceRole
  - Resource selection: Include specific resource types


---

## MH3-J — Tạo On-demand Backup
- Để không phải chờ lịch daily backup, em tạo on-demand backup thủ công cho các resource quan trọng.

## On-demand backup cho EFS
- AWS Backup → Protected resources → Create on-demand backup
- Chọn:
  - Resource type: EFS
  - File system: efs-minie-shared / fs-0b302015efed783b6
  - Backup vault: minie-w5-backup-vault
  - IAM role: AWSBackupDefaultServiceRole
- Click Create on-demand backup.

## On-demand backup cho RDS
- AWS Backup → Protected resources → Create on-demand backup
- Chọn:
  - Resource type: RDS
  - Database: minie-mysql-prod
  - Backup vault: minie-w5-backup-vault
  - IAM role: AWSBackupDefaultServiceRole
  - Chờ Backup job Completed.

## On-demand backup cho EBS
- AWS Backup → Protected resources → Create on-demand backup
- Chọn:
  - Resource type: EBS
  - Volume: ebs-minie-w5-backup-test
  - Backup vault: minie-w5-backup-vault
  - IAM role: AWSBackupDefaultServiceRole
- Chờ Backup job Completed.
![On-demand Backup](./evidence-W5/On-demand%20Backup.jpg)



---

## MH3-K — Restore Test EFS từ Recovery Point
- Đề yêu cầu backup plan phải được test restore thật, nên em thực hiện restore EFS từ recovery point.
- Vào AWS Backup → Backup vaults → minie-w5-backup-vault
- Mở tab Recovery points
- Chọn recovery point của EFS efs-minie-shared
- Chọn Actions → Restore
- Cấu hình restore:
  - Restore type: Full restore
  - Restore location: Restore to a new file system
  - File system type: Regional
  - Performance: General purpose
  - Encryption: Enabled
  - Restore role: Default role
  - Copy tags: ON
- Sau đó click Restore backup.
![Recovery Point](./evidence-W5/Recovery%20Point.jpg)


---

## MH3-L — Kiểm tra Restored EFS
- Sau khi restore completed, vào EFS → File systems.
- Restored EFS:
- Name: efs-minie-shared-restore-test-v2
- File system ID: fs-05c4192a1325c6c77
- VPC: minie-app / vpc-0b9790b9e161c3d0f
- Kiểm tra Network access:
  - Mount targets:
- ap-southeast-1a → app-vpc-app-a
- ap-southeast-1b → app-vpc-app-b
  - Security group: efs-minie / sg-0bc81e32536786a7a
![Restored EFS](./evidence-W5/Restored%20EFS.jpg)


---

## MH3-M — Tạo Access Point cho Restored EFS
- Để mount restored EFS vào ECS, tạo access point mới.
- Vào restored EFS efs-minie-shared-restore-test-v2
- Access points → Create access point
- Cấu hình:
  - Name: ap-minie-restore-root
  - Root directory path: /
  - POSIX user: 1000 : 1000
  - State: Available
![Access Point Restored EFS](./evidence-W5/Access%20Point%20Restored%20EFS.jpg)


---

## MH3-N — Mount Restored EFS vào ECS Task Definition
- Tạo revision mới của minie-backend-task.
- Ở phần Volumes, thêm volume restore:
  - Volume name: minie-restore-efs
  - Volume type: EFS
  - File system ID: fs-05c4192a1325c6c77
  - Access point ID: fsap-0b63ee4918f0743d8
  - Root directory: /
  - Transit encryption: Enabled
![volume restore](./evidence-W5/volume%20restore.jpg)
- Ở container minie-backend, thêm mount point:
  - Source volume: minie-restore-efs
  - Container path: /mnt/minie-restore
  - Read only: No
- Ngoài ra container vẫn giữ EFS gốc:
  - Source volume: minie-shared-efs
  - Container path: /mnt/minie-shared
  - Read only: No
![mount point](./evidence-W5/mount%20point.jpg)
- Sau đó update ECS Service:
  - ECS → cluster-minie-prod → svc-minie-backend → Update
  - Task definition revision: latest
  - Turn on ECS Exec: checked
  - Force new deployment: checked
- Chờ task mới RUNNING.


---

## MH3-O — Restore Test: Đọc lại file từ Restored EFS
- Sau khi task mới RUNNING, dùng ECS Exec vào container:
aws ecs execute-command `
  --cluster cluster-minie-prod `
  --task <TASK_ARN> `
  --container minie-backend `
  --interactive `
  --command "/bin/sh" `
  --region ap-southeast-1

- Trong container, kiểm tra restored EFS:
ls -la /mnt/minie-restore
find /mnt/minie-restore -type f

**Kết Quả**:
![Restore Test](./evidence-W5/Restore%20Test.jpg)


---

## MH4 — API Gateway trước Lambda

### Path đã chọn

**REST API Gateway + Lambda Proxy Integration + API Key + Usage Plan.**


### Kiến trúc triển khai
(Sơ đồ ở đây)
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

### Lý do đặt API Gateway trước Lambda

Trong production, không nên để client hoặc backend gọi Lambda một cách tùy tiện mà không có API layer kiểm soát. API Gateway đóng vai trò là controlled entry point trước Lambda.

API Gateway giúp cung cấp:

```text
1. HTTP endpoint chuẩn hóa
2. Authentication/authorization layer
3. Throttling
4. Usage plan
5. Request/response logging
6. Integration management
7. Decoupling giữa client/backend và Lambda implementation
```

Với kiến trúc này, backend không invoke Lambda trực tiếp. Backend gọi:

```text
POST /prod/media/metadata
```

API Gateway kiểm tra API key, usage plan, sau đó mới invoke Lambda.

### Lý do chọn REST API thay vì HTTP API

HTTP API thường rẻ hơn và đơn giản hơn. Tuy nhiên REST API Gateway hỗ trợ Usage Plan và API Key rõ ràng hơn cho bài này. Vì yêu cầu cần chứng minh:

```text
Có API key → 200
Không API key → 403
Có throttling bằng Usage Plan
```

nên REST API là lựa chọn phù hợp hơn.

## Lý do chọn API Key + Usage Plan

API Key + Usage Plan phù hợp với flow backend-to-API Gateway hoặc internal client-to-service trong phạm vi workshop/controlled integration.

Ưu điểm:

```text
Dễ cấu hình
Dễ test bằng curl
Có evidence 200/403 rõ ràng
Có throttling layer
Không cần user login flow phức tạp
```

Trong production, nếu API public cho end-user thì Cognito/JWT/OAuth sẽ phù hợp hơn. Nhưng với use case metadata API được backend gọi, API Key + Usage Plan là đủ hợp lý.

### Vì sao không chọn Cognito

Cognito phù hợp khi cần xác thực user cuối, ví dụ login, signup, refresh token, social login, federation. Nhưng API metadata này không phải endpoint login trực tiếp cho user. Nó được backend gọi sau khi xử lý product image.

Dùng Cognito ở đây sẽ làm kiến trúc phức tạp hơn mức cần thiết.


### Vì sao không chọn Lambda Authorizer

Lambda Authorizer phù hợp nếu cần custom auth logic như HMAC signature, JWT custom validation hoặc policy theo tenant. Nhưng nó yêu cầu thêm Lambda authorizer riêng, logic policy response và test thêm.

Trong bài này mục tiêu chính là chứng minh API Gateway đứng trước Lambda với auth và throttling, nên API Key + Usage Plan là lựa chọn tối ưu về độ đơn giản và khả năng kiểm chứng.

---



---

## MH4-A — Tạo DynamoDB table
- Vào DynamoDB → Tables → Create table
- Điền:
  - Table name: minie-media-metadata
  - Partition key: mediaId
  - Type: String
  - Table settings: Default settings
- Bấm Create table.
![DynamoDB](./evidence-W5/DynamoDB.jpg)


---

## MH4-B — Tạo Lambda function
- Vào Lambda → Functions → Create function
- Chọn:
  - Author from scratch
  - Function name: lambda-minie-media-metadata
  - Runtime: Node.js 20.x hoặc Node.js 22.x
  - Architecture: x86_64
  - Execution role: Use an existing role
  - Existing role: lambdaRole-minie-W5
- Bấm Create function
- Sau đó vào tab Code: 

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "minie-media-metadata";

const ddb = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-southeast-1",
});

export const handler = async (event) => {
  console.log("Incoming event:", JSON.stringify(event));

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    const mediaId = body.mediaId || `media-${Date.now()}`;
    const fileName = body.fileName || "unknown-file";
    const source = body.source || "api-gateway";
    const createdAt = new Date().toISOString();

    const item = {
      mediaId: { S: mediaId },
      fileName: { S: fileName },
      source: { S: source },
      createdAt: { S: createdAt },
    };

    console.log("Preparing DynamoDB PutItem:", {
      tableName: TABLE_NAME,
      mediaId,
      fileName,
      source,
      createdAt,
    });

    const putResult = await ddb.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );

    console.log("DynamoDB PutItem succeeded:", {
      tableName: TABLE_NAME,
      mediaId,
      fileName,
      source,
      createdAt,
      requestId: putResult.$metadata?.requestId,
      httpStatusCode: putResult.$metadata?.httpStatusCode,
      attempts: putResult.$metadata?.attempts,
      totalRetryDelay: putResult.$metadata?.totalRetryDelay,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        message: "Media metadata saved to DynamoDB",
        data: {
          mediaId,
          fileName,
          source,
          createdAt,
          tableName: TABLE_NAME,
          dynamoDbStatusCode: putResult.$metadata?.httpStatusCode,
          dynamoDbRequestId: putResult.$metadata?.requestId,
        },
      }),
    };
  } catch (error) {
    console.error("Lambda error:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        message: error.message,
      }),
    };
  }
};

- Vào Configuration → Environment variables, thêm: `TABLE_NAME=minie-media-metadata`
- Bấm Deploy
![lambda](./evidence-W5/lambda.jpg)
- Test event
Dùng test event này: {
  "body": "{\"mediaId\":\"test-media-001\",\"fileName\":\"test-image.jpg\",\"source\":\"lambda-direct-test\"}"
}
![Test Lambda](./evidence-W5/Test%20Lambda.jpg)
- Sau đó vào DynamoDB table minie-media-metadata kiểm tra item test-media-001
![test-media-001](./evidence-W5/test-media-001.jpg)
- Log khi test với: {
  "body": "{\"mediaId\":\"test-media-002\",\"fileName\":\"test-image-002.jpg\",\"source\":\"lambda-direct-test\"}"
}
![test-media-002](./evidence-W5/test-media-002.jpg)


---

## MH4-D — Tạo REST API Gateway
- Vào API Gateway → APIs → Create API
- Chọn:
  - REST API
  - Build
- Điền:
  - API name: api-minie-media
  - Endpoint type: Regional
- Bấm Create API.


---

## MH4-E — Tạo Resource và Method
Trong API api-minie-media:
- Resources → Create resource
- Tạo resource: Resource path: /media
- Chọn /media, tạo resource tiếp: Resource path: /metadata
- Chọn resource /media/metadata, bấm:
  - Create method
  - Chọn:
* Method type: POST
* Integration type: Lambda function
* Lambda proxy integration: ON
* Lambda function: lambda-minie-media-metadata
![API Gateway](./evidence-W5/API%20Gateway.jpg)


---

## MH4-F — Bật API Key Required cho method
- Chọn method: POST /media/metadata → Method request
- Tìm: API Key Required
- Chỉnh thành: true
- Save lại.
- Sau đó Deploy API:
  - Stage: New stage
  - Stage name: prod
![Deploy API](./evidence-W5/Deploy%20API.jpg)


---

## MH4-G — Tạo API Key
- Vào bên trái API Gateway: API Keys → Create API key
- Điền:
  - Name: api-key-minie-media
  - Auto generate: chọn
- Bấm Save.
- Sau khi tạo, bấm Show để copy value API key.
![API Key](./evidence-W5/API%20Key.jpg)


---

## MH4-H — Tạo Usage Plan + Throttling
- Vào Usage Plans → Create usage plan
- Điền:
  - Name: usage-plan-minie-media
  - Description: Throttling plan for Mini E media metadata API
- Throttling:
  - Rate: 5 requests per second
  - Burst: 10 requests
- Quota có thể để:
  - Enable quota: optional
  - Requests: 1000 per day
- Add API stage:
  - API: api-minie-media
  - Stage: prod
- Add API key: api-key-minie-media
- Save.
![Usage Plan](./evidence-W5/Usage%20Plan.jpg)


---

## MH4-I — Test curl authenticated 200
Chạy PowerShell:
$API_URL="https://<api-id>.execute-api.ap-southeast-1.amazonaws.com/prod/media/metadata"
$API_KEY="<API_KEY_VALUE>"

curl -Method POST `
  -Uri $API_URL `
  -Headers @{ "x-api-key" = $API_KEY; "Content-Type" = "application/json" } `
  -Body '{"mediaId":"api-gw-test-001","fileName":"api-gateway-test.jpg","source":"api-gateway-authenticated"}'

**Kết Quả**:
![Test curl authenticated 200](./evidence-W5/Test%20curl%20authenticated%20200.jpg)
![Test curl DynamoDB](./evidence-W5/Test%20curl%20DynamoDB.jpg)


---

## MH4-J — Test curl unauthenticated 403
Chạy không có API key:
curl -Method POST `
  -Uri $API_URL `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{"mediaId":"api-gw-test-no-key","fileName":"blocked.jpg","source":"no-api-key"} '

![Test curl unauthenticated 403](./evidence-W5/Test%20curl%20unauthenticated%20403.jpg)


---

## MH4-K — Cập nhật ứng dụng gọi API Gateway
- API Gateway endpoint được sử dụng:
https://rf2yeas777.execute-api.ap-southeast-1.amazonaws.com/prod/media/metadata
- Trong ECS Task Definition của backend, em thêm 2 biến môi trường:
API_GATEWAY_MEDIA_METADATA_URL=https://rf2yeas777.execute-api.ap-southeast-1.amazonaws.com/prod/media/metadata
API_GATEWAY_MEDIA_API_KEY=<API_KEY_VALUE>
- Trong code backend, sau khi seller tạo sản phẩm có upload ảnh, backend gọi API Gateway bằng HTTP request với header x-api-key.
- Đoạn logic được thêm vào backend:
private async sendMediaMetadataToApiGateway(payload: {
  mediaId: string;
  fileName: string;
  source: string;
  productId?: number;
  sellerId?: number;
  imageUrl?: string;
  cloudinaryPublicId?: string;
  bytes?: number;
  format?: string;
}) {
  const apiUrl = process.env.API_GATEWAY_MEDIA_METADATA_URL;
  const apiKey = process.env.API_GATEWAY_MEDIA_API_KEY;

  if (!apiUrl || !apiKey) {
    console.warn('API Gateway media metadata env is missing. Skip metadata sync.', {
      hasApiUrl: Boolean(apiUrl),
      hasApiKey: Boolean(apiKey),
      mediaId: payload.mediaId,
    });
    return null;
  }

  console.log('Calling API Gateway media metadata endpoint:', {
    apiUrl,
    mediaId: payload.mediaId,
    fileName: payload.fileName,
    source: payload.source,
    productId: payload.productId,
  });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  console.log('API Gateway media metadata response:', {
    mediaId: payload.mediaId,
    status: response.status,
    ok: response.ok,
    body: responseText,
  });

  if (!response.ok) {
    throw new Error(
      `API Gateway media metadata call failed. Status=${response.status}, Body=${responseText}`,
    );
  }

  return responseText ? JSON.parse(responseText) : null;
}
- Trong luồng tạo sản phẩm, sau khi product được tạo thành công, backend gọi API Gateway cho từng ảnh đã upload:
if (uploadedImagesMetadata.length > 0) {
  await Promise.allSettled(
    uploadedImagesMetadata.map((image, index) =>
      this.sendMediaMetadataToApiGateway({
        mediaId: `product-${product.id}-image-${index + 1}-${Date.now()}`,
        fileName: image.originalName,
        source: 'mini-e-backend-products-create',
        productId: product.id,
        sellerId: userId,
        imageUrl: image.cloudinaryUrl,
        cloudinaryPublicId: image.cloudinaryPublicId,
        bytes: image.bytes,
        format: image.format,
      }),
    ),
  );
}

- Sau khi chỉnh code backend, build lại Docker image và push lên ECR
- Sau đó cập nhật ECS Service


---

## MH4-L — Test ứng dụng gọi API Gateway khi tạo sản phẩm
- Em đăng nhập vào website bằng tài khoản seller/admin và tạo một sản phẩm mới có upload ảnh.
- Kết quả trên frontend:
![Test frontend](./evidence-W5/Test%20frontend.jpg)


---

## MH4-M — Evidence ECS Backend gọi API Gateway thành công
- CloudWatch → Log groups → /ecs/minie-backend-task
![Log API Gateway thành công](./evidence-W5/API%20Gateway%20thành%20công.jpg)
**Điều này chứng minh backend ECS đã gọi API Gateway endpoint thành công. API Gateway sau đó invoke Lambda và Lambda ghi metadata vào DynamoDB.**


---

## MH4-N — Evidence Lambda ghi DynamoDB từ request của backend
- CloudWatch → Log groups → /aws/lambda/lambda-minie-media-metadata
![Lambda ghi DynamoDB](./evidence-W5/Lambda%20ghi%20DynamoDB.jpg)
**Điều này chứng minh Lambda đã nhận request metadata ảnh từ API Gateway và ghi thành công vào DynamoDB.**


---

## MH4-O — Evidence DynamoDB có metadata từ backend
- DynamoDB → Tables → minie-media-metadata → Explore table items
![DynamoDB có metadata](./evidence-W5/ynamoDB%20có%20metadata.jpg)



---

## MH5 — Serverless Scaling Pattern - S3-Event-Triggered Lambda Pattern

### Path chọn

```text
S3 Event Triggered Lambda Pattern
```

### Kiến trúc triển khai
(Vẽ sơ đồ ở đây)
Các thành phần chính:

| Thành phần | Giá trị |
|---|---|
| Event source | S3 ObjectCreated |
| Bucket | `media-s3-minie` |
| Prefix | `products/` |
| Lambda | `lambda-minie-media-metadata` |
| Output | DynamoDB `minie-media-metadata` |
| Test object | `products/ALB.jpg` |

### Lý do chọn S3 Event Triggered Lambda trong thực tế
Ứng dụng Mini E có media workflow: sản phẩm có ảnh, file được lưu trong media bucket. Khi có file mới được upload vào S3, việc xử lý metadata là một use case rất tự nhiên cho event-driven serverless architecture.
Flow:

```text
ObjectCreated in S3
        ↓
Lambda triggered automatically
        ↓
Parse bucket/object metadata
        ↓
PutItem DynamoDB
```
Pattern này tốt vì:

```text
1. Không cần backend polling S3
2. Không cần worker chạy nền
3. Lambda chỉ chạy khi có event
4. Scale theo số lượng object upload
5. Giảm coupling giữa upload flow và metadata processing
6. Phù hợp với kiến trúc serverless event-driven
```

### Vì sao đây là scaling pattern

S3 Event Triggered Lambda scale theo event source. Khi nhiều object được upload, S3 gửi nhiều event và Lambda có thể scale số invocation tương ứng, trong giới hạn concurrency của account/function.

Đây là pattern phổ biến trong production cho:
```text
Image processing
Metadata extraction
Thumbnail generation
Virus scanning
Data ingestion
Log processing
Document processing
```

### Vì sao không chọn Reserved Concurrency làm path chính

Reserved Concurrency là một scaling control pattern, phù hợp khi muốn giới hạn số concurrent executions của một Lambda để bảo vệ downstream system như database hoặc external API.

Tuy nhiên, nó chủ yếu là **control scaling**, không thể hiện rõ event-driven workflow của ứng dụng Mini E bằng S3 trigger. Với use case media upload, S3 Event Triggered Lambda có tính nghiệp vụ rõ hơn.

Nói cách khác:

```text
Reserved Concurrency: phù hợp để giới hạn Lambda
S3 Event Triggered Lambda: phù hợp để xử lý event upload file
```

Vì Mini E có media bucket và ảnh sản phẩm, S3 trigger là path tự nhiên hơn.


### Vì sao không chọn Provisioned Concurrency

Provisioned Concurrency phù hợp khi Lambda có yêu cầu latency thấp, cần giảm cold start, ví dụ API critical path có traffic ổn định.

Trong bài này Lambda xử lý metadata ảnh, không phải latency-critical endpoint. Thêm Provisioned Concurrency có thể làm tăng chi phí mà không mang lại nhiều lợi ích cho workload này.


### Vì sao không chọn Async Invocation + DLQ

Async Invocation + DLQ rất phù hợp cho reliability pattern, đặc biệt khi cần retry và lưu event lỗi vào SQS/SNS DLQ. Tuy nhiên, nó tập trung vào failure handling nhiều hơn là thể hiện workflow media upload.

Với yêu cầu chứng minh serverless scaling pattern, S3 ObjectCreated trigger dễ hiểu hơn, trực tiếp hơn và gắn với domain ứng dụng hơn.

### Kết luận

S3 Event Triggered Lambda là lựa chọn phù hợp nhất cho MH5 vì nó vừa là serverless scaling pattern thực tế, vừa gắn trực tiếp với chức năng media của ứng dụng. Nó cho thấy hệ thống có thể xử lý file upload theo event mà không cần server nền, worker thủ công hoặc polling.

## 1 — Sửa Lambda code để hỗ trợ cả API Gateway và S3 Event
- Vào: Lambda → Thay toàn bộ code Lambda:
![Lambda code](./evidence-W5/lambda.mjs)

## 2 — Tạo S3 trigger cho Lambda
- Vào Lambda → Functions → lambda-minie-media-metadata
- Chọn Add trigger
- Cấu hình:
  - Source: S3
  - Bucket: media-s3-minie
  - Event type: All object create events
  - Prefix: products/
  - Suffix: để trống hoặc .jpg nếu chỉ test jpg
  - Recursive invocation warning: tick xác nhận nếu AWS hỏi
- Bấm Add.
![trigger Lambda](./evidence-W5/trigger%20Lambda.jpg)

## 3 — Upload file test vào S3
- Vào: S3 → Buckets → media-s3-minie → products/
- Upload một ảnh: ALB.jpg
![file test vào S3](./evidence-W5/file%20test%20vào%20S3.jpg)

## 4 — Check Lambda logs
- Vào CloudWatch → Log groups → /aws/lambda/lambda-minie-media-metadata
- Mở log stream mới nhất
![Lambda logs MH5](./evidence-W5/Lambda%20logs%20MH5.jpg)
> ✅ Lambda được trigger bởi S3 event
> ✅ Event đến từ bucket media-s3-minie, file upload nằm trong products/ALB.jpg.

## 5 — Check DynamoDB item
- Vào DynamoDB → Tables → minie-media-metadata → Explore table items
![Check DynamoDB item MH5](./evidence-W5/Check%20DynamoDB%20item%20MH5.jpg)
> ✅ Item từ S3 trigger đã được ghi vào table