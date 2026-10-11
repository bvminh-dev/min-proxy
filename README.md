# min-proxy

Proxy HTTP nhẹ viết bằng Node.js, không cần cài thư viện. Gọi vào proxy bằng một `code`, proxy tra URL trong `config.json`, gọi tới URL đó với đúng method, header, query và body, rồi trả kết quả về y nguyên.

## Yêu cầu

- Node.js 18 trở lên

## Chạy

```bash
npm start
# hoặc
node server.js
```

Mặc định chạy ở `http://localhost:3800` (theo `port` trong `config.json`).

## Cấu hình

File `config.json`:

```json
{
  "port": 3800,
  "apiKey": "",
  "timeoutMs": 60000,
  "routes": {
    "lms": "https://lms-api-dev.atstechnology.vn",
    "demo": "https://httpbin.org/anything"
  }
}
```

| Khóa | Ý nghĩa |
|---|---|
| `port` | Cổng proxy lắng nghe. Đổi port cần restart. |
| `apiKey` | Nếu điền, người gọi phải gửi header `x-api-key` khớp giá trị này. Để trống thì không kiểm tra. |
| `timeoutMs` | Thời gian chờ upstream tối đa (ms). Mặc định 60000. |
| `routes` | Bảng `code` → URL đích. Sửa `routes` không cần restart, proxy tự nạp lại khi file thay đổi. |

Đổi `config.json` chỉ có hiệu lực với `routes`, `apiKey` và `timeoutMs`. Riêng `port` thì phải restart.

## Cách gọi

```
http://localhost:<port>/<code>[/path/phụ][?query]
```

Proxy ghép path phụ và query vào URL đích. Ví dụ với route `lms`:

```
POST http://localhost:3800/lms/api/v1/auth/otp/request
→ POST https://lms-api-dev.atstechnology.vn/api/v1/auth/otp/request
```

Query trong URL của route và query của request được gộp lại.

### Ví dụ

cmd (Windows):

```bat
curl --url "http://localhost:3800/lms/api/v1/auth/otp/request" ^
  -H "content-type: application/json" ^
  -H "origin: https://lms-dev.atstechnology.vn" ^
  -H "referer: https://lms-dev.atstechnology.vn/" ^
  --data-raw "{\"email\":\"you@example.com\"}"
```

PowerShell:

```powershell
curl.exe "http://localhost:3800/lms/api/v1/auth/otp/request" `
  -H "content-type: application/json" `
  --data-raw '{\"email\":\"you@example.com\"}'
```

Bash:

```bash
curl "http://localhost:3800/lms/api/v1/auth/otp/request" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com"}'
```

## Hành vi

- Giữ nguyên method, header, query và body của request. Chỉ bỏ `host`, `x-api-key` và các header hop-by-hop như `connection`, `transfer-encoding`.
- Trả về nguyên status, header (kể cả nhiều `set-cookie`) và body của upstream. Body không bị giải nén lại.
- Body được stream cả hai chiều nên truyền file lớn vẫn được.
- Redirect không được theo, 301/302 được trả nguyên cho người gọi.

### Mã lỗi do proxy trả về

| Mã | Khi nào |
|---|---|
| 401 | Có đặt `apiKey` nhưng thiếu hoặc sai `x-api-key` |
| 404 | `code` không có trong `routes` |
| 500 | `config.json` lỗi cú pháp hoặc không đọc được |
| 502 | Không gọi được upstream hoặc quá `timeoutMs` |

## Lưu ý bảo mật

- Nếu điền `apiKey` thật hoặc route chứa token, đừng commit `config.json` lên repo. Hãy thêm nó vào `.gitignore` và dùng một file mẫu.
- Proxy lắng nghe trên mọi network interface, nên các máy khác trong mạng LAN cũng gọi được. Nếu không muốn vậy, hãy đặt `apiKey` hoặc chặn cổng bằng firewall.
