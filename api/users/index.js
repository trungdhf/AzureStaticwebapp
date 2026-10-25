const sql = require("mssql");

let poolPromise;

function getPool() {
  if (!process.env.SQL_CONNECTION_STRING) {
    throw new Error("Thiếu cấu hình SQL_CONNECTION_STRING.");
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
    context.res = response(500, { error: "Không thể xử lý yêu cầu. Vui lòng kiểm tra cấu hình dịch vụ." });
  }
};
