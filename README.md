# PeopleDesk - Azure Static Web Apps + Azure SQL

Ứng dụng mẫu hiển thị người dùng từ Azure SQL và cho phép chỉnh sửa tên/email. Trình duyệt chỉ gọi API cùng nguồn; thông tin kết nối cơ sở dữ liệu chỉ được cấu hình ở phía API.

## Chạy local

Yêu cầu Node.js 20+, Azure Functions Core Tools và Azure Static Web Apps CLI.

1. Tạo Azure SQL database và chạy [`schema.sql`](./schema.sql).
2. Tạo file `api/local.settings.json` (không commit file này) với thông tin kết nối:

   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "AzureWebJobsStorage": "UseDevelopmentStorage=true",
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "SQL_CONNECTION_STRING": "Server=tcp:<server>.database.windows.net,1433;Initial Catalog=<database>;Persist Security Info=False;User ID=<user>;Password=<password>;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
     }
   }
   ```

3. Tại thư mục gốc, cài API dependency và chạy ứng dụng:

   ```powershell
   Push-Location api; npm install; Pop-Location
   swa start . --api-location api
   ```

Mở URL được SWA CLI hiển thị. Trong môi trường local, `api/local.settings.json` cung cấp biến môi trường cho Functions.

## Triển khai

1. Tạo Azure SQL server/database, cấu hình firewall để cho phép truy cập từ môi trường chạy API, và chạy `schema.sql`.
2. Tạo Azure Static Web App (Standard) và kết nối repository. Dùng các thiết lập build:
   - App location: `/`
   - API location: `api`
   - Output location: để trống (ứng dụng tĩnh nằm ngay tại thư mục gốc).
3. Trong **Static Web App → Configuration → Application settings**, thêm `SQL_CONNECTION_STRING` với connection string của Azure SQL. Không đặt thông tin đăng nhập trong mã nguồn hoặc trong biến môi trường `VITE_*`.
4. Triển khai lại ứng dụng. Mở URL Static Web App để xem danh sách; chọn **Chỉnh sửa** để cập nhật bản ghi trong SQL.

API dùng câu lệnh SQL có tham số cho thao tác cập nhật. Hãy cấp cho tài khoản SQL của ứng dụng quyền tối thiểu cần thiết (đọc bảng `dbo.Users`, cập nhật các cột `Name` và `Email`), không dùng tài khoản quản trị.

## API

- `GET /api/users` — lấy danh sách.
- `PUT /api/users/{id}` — cập nhật `{ "name": "...", "email": "..." }`.

Khi API gặp lỗi SQL, response có mã chẩn đoán an toàn như `SQL_CONFIG_MISSING`, `SQL_LOGIN_FAILED`, `SQL_OBJECT_NOT_FOUND` hoặc `SQL_NETWORK_ERROR`. API không bao giờ trả connection string, username hay password; xem log API/Application Insights để điều tra lỗi khác.
