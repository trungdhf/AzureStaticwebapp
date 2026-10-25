const sql = require("mssql");

let poolPromise;

function getPool() {
  if (!process.env.SQL_CONNECTION_STRING) {
    const error = new Error("SQL_CONNECTION_STRING is not configured.");
    error.code = "SQL_CONFIG_MISSING";
    throw error;
  }
  if (!poolPromise) {
    poolPromise = sql.connect(process.env.SQL_CONNECTION_STRING).catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }
  return poolPromise;
}

function response(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

function getSafeError(error) {
  if (error.code === "SQL_CONFIG_MISSING") {
    return {
      code: "SQL_CONFIG_MISSING",
      message: "Chưa cấu hình biến môi trường SQL_CONNECTION_STRING cho API."
    };
  }

  const sqlNumber = error.number || error.originalError?.info?.number;
  if (error.code === "ELOGIN" || sqlNumber === 18456) {
    return {
      code: "SQL_LOGIN_FAILED",
      message: "Azure SQL từ chối đăng nhập. Hãy kiểm tra kiểu xác thực, tài khoản và quyền truy cập."
    };
  }
  if (sqlNumber === 208) {
    return {
      code: "SQL_OBJECT_NOT_FOUND",
      message: "Không tìm thấy bảng dbo.Users. Hãy xác nhận bảng nằm trong database được cấu hình."
    };
  }
  if (sqlNumber === 4060) {
    return {
      code: "SQL_DATABASE_UNAVAILABLE",
      message: "Không mở được database. Hãy kiểm tra tên database và quyền của tài khoản."
    };
  }
  if (["ETIMEOUT", "ESOCKET", "ENOTFOUND", "ECONNRESET"].includes(error.code)) {
    return {
      code: "SQL_NETWORK_ERROR",
      message: "Không kết nối được Azure SQL. Hãy kiểm tra server, cổng 1433 và firewall/network rules."
    };
  }
  if (error.code === "EREQUEST") {
    return {
      code: "SQL_REQUEST_FAILED",
      message: "Azure SQL từ chối truy vấn. Hãy kiểm tra database, bảng dbo.Users và quyền truy cập."
    };
  }
  return {
    code: "SQL_REQUEST_FAILED",
    message: "Yêu cầu tới Azure SQL thất bại. Xem log API/Application Insights để biết chi tiết."
  };
}

module.exports = async function (context, req) {
  const id = req.params.id;

  try {
    if (req.method === "GET" && !id) {
      const pool = await getPool();
      const result = await pool.request().query(
        "SELECT Id AS id, Name AS name, Email AS email FROM dbo.Users ORDER BY Id;"
      );
      context.res = response(200, result.recordset);
      return;
    }

    if (req.method === "PUT" && id) {
      const userId = Number(id);
      const { name, email } = req.body || {};
      if (!Number.isSafeInteger(userId) || userId < 1) {
        context.res = response(400, { error: "ID người dùng không hợp lệ." });
        return;
      }
      if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
        context.res = response(400, { error: "Tên phải có từ 1 đến 100 ký tự." });
        return;
      }
      if (typeof email !== "string" || !email.trim() || email.trim().length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        context.res = response(400, { error: "Email không hợp lệ." });
        return;
      }

      const pool = await getPool();
      const result = await pool.request()
        .input("id", sql.Int, userId)
        .input("name", sql.NVarChar(100), name.trim())
        .input("email", sql.NVarChar(254), email.trim())
        .query(
          "UPDATE dbo.Users SET Name = @name, Email = @email OUTPUT INSERTED.Id AS id, INSERTED.Name AS name, INSERTED.Email AS email WHERE Id = @id;"
        );

      if (result.recordset.length === 0) {
        context.res = response(404, { error: "Không tìm thấy người dùng." });
        return;
      }
      context.res = response(200, result.recordset[0]);
      return;
    }

    context.res = response(404, { error: "Không tìm thấy endpoint." });
  } catch (error) {
    context.log.error("Azure SQL request failed:", error);
    const safeError = getSafeError(error);
    context.res = response(500, {
      error: safeError.message,
      code: safeError.code
    });
  }
};
