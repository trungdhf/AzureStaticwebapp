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
2. Tạo Azure Static Web App (Free hoặc Standard) và kết nối repository. Dùng các thiết lập build:
   - App location: `/`
   - API location: `api`
   - Output location: để trống (ứng dụng tĩnh nằm ngay tại thư mục gốc).
3. Trong **Static Web App → Configuration → Application settings**, thêm `SQL_CONNECTION_STRING` với connection string của Azure SQL. Không đặt thông tin đăng nhập trong mã nguồn hoặc trong biến môi trường `VITE_*`.
4. Triển khai lại ứng dụng, cấp quyền theo hướng dẫn bên dưới, rồi đăng nhập để xem/chỉnh sửa dữ liệu.

API dùng câu lệnh SQL có tham số cho thao tác cập nhật. Hãy cấp cho tài khoản SQL của ứng dụng quyền tối thiểu cần thiết (đọc bảng `dbo.Users`, cập nhật các cột `Name` và `Email`), không dùng tài khoản quản trị.

## Đăng nhập Microsoft Entra ID và cấp quyền (gói Free)

Ứng dụng dùng nhà cung cấp Microsoft tích hợp (`/.auth/login/aad`), không cần tự tạo App Registration. Đăng xuất qua `/.auth/logout`; giao diện đọc phiên tại `/.auth/me`. Nhà cung cấp mặc định không giới hạn tenant công ty: chỉ tài khoản được cấp role `members` mới được đọc và sửa dữ liệu. Không mời tài khoản ngoài phạm vi được phép.

1. Trong Azure Portal, mở Static Web App → **Role management** (Quản lý vai trò) → **Invite**.
2. Chọn nhà cung cấp **Microsoft Entra ID**, nhập đúng tài khoản Microsoft được phép sử dụng và role **`members`** (chữ thường, không phải `authenticated`).
3. Tạo liên kết mời và gửi riêng cho người dùng. Người dùng phải mở liên kết còn hiệu lực và đăng nhập bằng đúng tài khoản được mời để nhận role.
4. Sau khi nhận lời mời, đăng xuất/đăng nhập lại vào ứng dụng. Quản trị viên cũng phải mời tài khoản của mình nếu muốn truy cập dữ liệu.
5. Gỡ role trong Role management để thu hồi quyền; thay đổi có thể cần người dùng đăng nhập lại để cập nhật phiên.

`/api/*` yêu cầu role `members` ở phía Azure Static Web Apps cho cả GET và PUT. GitHub login bị tắt. Trang tĩnh công khai chỉ hiển thị hướng dẫn đăng nhập; ẩn giao diện không thay thế kiểm tra quyền phía server. Không cấu hình redirect 401 toàn cục sang HTML để API tiếp tục trả lỗi 401/403 cho `fetch`.

Đăng nhập web không cấp quyền Azure SQL hay SharePoint. `SQL_CONNECTION_STRING` vẫn là cấu hình backend riêng. Chính sách Microsoft Entra của công ty có thể yêu cầu IT phê duyệt đăng nhập.

Khi chạy bằng SWA CLI, trình giả lập đăng nhập cho phép chọn provider `aad` và role `members` để kiểm tra luồng này; đây không phải xác thực Entra thật. Kiểm tra trên Azure: chưa đăng nhập không truy cập được API, tài khoản không có role nhận 403, tài khoản được mời có role mới đọc/cập nhật được dữ liệu. Giới hạn API thực tế phải được xác nhận sau deployment.

Chạy kiểm thử giao diện đăng nhập và cấu hình role bằng `node --test tests\auth.test.js` (không cần cài thêm dependency).

## API

- `GET /api/users` — lấy danh sách.
- `PUT /api/users/{id}` — cập nhật `{ "name": "...", "email": "..." }`.

Khi API gặp lỗi SQL, response có mã chẩn đoán an toàn như `SQL_CONFIG_MISSING`, `SQL_LOGIN_FAILED`, `SQL_OBJECT_NOT_FOUND` hoặc `SQL_NETWORK_ERROR`. API không bao giờ trả connection string, username hay password; xem log API/Application Insights để điều tra lỗi khác.
