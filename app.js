const usersBody = document.querySelector("#users-body");
const notice = document.querySelector("#notice");
const userCount = document.querySelector("#user-count");
const refreshButton = document.querySelector("#refresh-button");
const connectionStatus = document.querySelector("#connection-status");
const authPanel = document.querySelector("#auth-panel");
const dataPanel = document.querySelector("#data-panel");
const authMessage = document.querySelector("#auth-message");
const accountName = document.querySelector("#account-name");
const loginLink = document.querySelector("#login-link");
const logoutLink = document.querySelector("#logout-link");
const authRetry = document.querySelector("#auth-retry");
let users = [];
let editingId = null;
let canAccessData = false;

function clearProtectedData() {
  canAccessData = false;
  users = [];
  editingId = null;
  usersBody.replaceChildren();
  userCount.textContent = "—";
  clearNotice();
  dataPanel.hidden = true;
  authPanel.hidden = false;
}

async function checkSession() {
  clearProtectedData();
  authRetry.disabled = true;
  authMessage.textContent = "Đang kiểm tra phiên đăng nhập...";
  try {
    const response = await fetch("/.auth/me", { cache: "no-store" });
    if (!response.ok) throw new Error(`Không kiểm tra được phiên đăng nhập (HTTP ${response.status}).`);
    const { clientPrincipal } = await response.json();
    const signedIn = Boolean(clientPrincipal);
    accountName.textContent = clientPrincipal?.userDetails || "";
    loginLink.hidden = signedIn;
    logoutLink.hidden = !signedIn;
    if (!signedIn) {
      authMessage.textContent = "Vui lòng đăng nhập Microsoft bằng tài khoản đã được quản trị viên mời.";
      return;
    }
    if (clientPrincipal.identityProvider !== "aad" ||
        !clientPrincipal.userRoles?.includes("members")) {
      authMessage.textContent = "Tài khoản chưa có quyền truy cập. Hãy nhờ quản trị viên mời tài khoản Microsoft này vào role members, mở liên kết mời và đăng nhập lại.";
      return;
    }
    canAccessData = true;
    authPanel.hidden = true;
    dataPanel.hidden = false;
    await loadUsers();
  } catch (error) {
    authMessage.textContent = error.message || "Không kiểm tra được đăng nhập. Vui lòng thử lại.";
  } finally {
    authRetry.disabled = false;
  }
}

function handleAccessDenied(response) {
  if (response.status !== 401 && response.status !== 403) return false;
  clearProtectedData();
  authMessage.textContent = "Phiên đăng nhập đã hết hạn hoặc tài khoản không có quyền members. Hãy đăng nhập lại hoặc liên hệ quản trị viên.";
  loginLink.hidden = false;
  return true;
}

function setConnectionStatus(connected) {
  connectionStatus.className = connected ? "connection" : "connection error";
  connectionStatus.lastElementChild.textContent = connected ? "Azure SQL" : "Mất kết nối";
}

function showNotice(message, type) {
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
}

function clearNotice() {
  notice.hidden = true;
  notice.textContent = "";
  notice.className = "notice";
}

function renderUsers() {
  userCount.textContent = String(users.length);
  if (users.length === 0) {
    usersBody.innerHTML = '<tr><td class="table-state" colspan="4">Chưa có người dùng nào trong cơ sở dữ liệu.</td></tr>';
    return;
  }

  usersBody.replaceChildren(...users.map((user) => {
    const row = document.createElement("tr");
    const idCell = document.createElement("td");
    idCell.textContent = user.id;
    row.append(idCell);

    if (editingId === user.id) {
      row.append(
        makeInputCell(user.name, "name", `Tên người dùng ${user.id}`),
        makeInputCell(user.email, "email", `Email người dùng ${user.id}`)
      );
      const actions = document.createElement("td");
      const save = makeButton("Lưu", "save-button", () => saveUser(user.id));
      const cancel = makeButton("Hủy", "cancel-button", () => {
        editingId = null;
        clearNotice();
        renderUsers();
      });
      actions.append(save, cancel);
      row.append(actions);
    } else {
      const name = document.createElement("td");
      name.className = "name-cell";
      name.textContent = user.name;
      const email = document.createElement("td");
      email.className = "email-cell";
      email.textContent = user.email;
      const actions = document.createElement("td");
      actions.append(makeButton("Chỉnh sửa", "edit-button", () => {
        editingId = user.id;
        clearNotice();
        renderUsers();
        usersBody.querySelector('input[name="name"]')?.focus();
      }));
      row.append(name, email, actions);
    }
    return row;
  }));
}

function makeInputCell(value, name, label) {
  const cell = document.createElement("td");
  const input = document.createElement("input");
  input.className = "edit-input";
  input.name = name;
  input.type = name === "email" ? "email" : "text";
  input.value = value;
  input.maxLength = name === "name" ? 100 : 254;
  input.required = true;
  input.setAttribute("aria-label", label);
  cell.append(input);
  return cell;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function loadUsers() {
  if (!canAccessData) return;
  clearNotice();
  refreshButton.disabled = true;
  usersBody.innerHTML = '<tr><td class="table-state" colspan="4">Đang tải dữ liệu...</td></tr>';
  try {
    const response = await fetch("/api/users");
    if (handleAccessDenied(response)) return;
    if (!response.ok) throw new Error(await getErrorMessage(response));
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("API trả về dữ liệu không hợp lệ.");
    users = data;
    editingId = null;
    setConnectionStatus(true);
    renderUsers();
  } catch (error) {
    users = [];
    userCount.textContent = "—";
    usersBody.innerHTML = '<tr><td class="table-state error" colspan="4">Không thể tải danh sách người dùng.</td></tr>';
    setConnectionStatus(false);
    showNotice(error.message || "Không thể kết nối API. Hãy kiểm tra cấu hình Azure SQL.", "error");
  } finally {
    refreshButton.disabled = false;
  }
}

async function saveUser(id) {
  if (!canAccessData) return;
  const row = [...usersBody.rows].find((item) => Number(item.cells[0].textContent) === id);
  const name = row?.querySelector('input[name="name"]')?.value.trim();
  const email = row?.querySelector('input[name="email"]')?.value.trim();
  if (!name || !email) {
    showNotice("Vui lòng nhập đầy đủ tên và email.", "error");
    return;
  }

  const saveButton = row.querySelector(".save-button");
  saveButton.disabled = true;
  clearNotice();
  try {
    const response = await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email })
    });
    if (handleAccessDenied(response)) return;
    if (!response.ok) throw new Error(await getErrorMessage(response));
    const updatedUser = await response.json();
    users = users.map((user) => user.id === id ? updatedUser : user);
    editingId = null;
    renderUsers();
    showNotice("Đã cập nhật thông tin người dùng.", "success");
  } catch (error) {
    showNotice(error.message || "Không thể cập nhật dữ liệu.", "error");
    saveButton.disabled = false;
  }
}

async function getErrorMessage(response) {
  try {
    const data = await response.json();
    return data.error || `Yêu cầu thất bại (HTTP ${response.status}).`;
  } catch {
    return `Yêu cầu thất bại (HTTP ${response.status}).`;
  }
}

refreshButton.addEventListener("click", loadUsers);
authRetry.addEventListener("click", checkSession);
checkSession();
