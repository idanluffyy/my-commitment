/* My Commitment — data-driven budgeting PWA
   All data lives in localStorage, split per LOCAL PROFILE (no login/backend —
   see the "profiles" section below): each profile's data is its own
   localStorage entry, keyed by month ("YYYY-MM") inside that.
   No personal data is baked in: every new profile starts blank. */

const PROFILES_KEY = "myCommitmentProfiles";
const LEGACY_DATA_KEY = "myCommitmentData"; // pre-v5.0 single-profile storage

const CATEGORIES = [
    { id: "housing", label: "Housing", icon: "🏠", color: "#ff9f43" },
    { id: "transport", label: "Transport", icon: "🚗", color: "#ff6b6b" },
    { id: "food", label: "Food", icon: "🍔", color: "#2ecc71" },
    { id: "bills", label: "Bills", icon: "💡", color: "#ffd43b" },
    { id: "others", label: "Others", icon: "📦", color: "#a78bfa" }
];

const ACCOUNT_TYPES = [
    { id: "cash", label: "Cash", icon: "💵" },
    { id: "ewallet", label: "E-Wallet", icon: "📱" },
    { id: "bank", label: "Bank Account", icon: "🏦" },
    { id: "debt", label: "Debt / Credit Card", icon: "💳" }
];

/* ================= PROFILES (local, no login/backend) ================= */
/* Multiple people (e.g. you and your spouse) can each have a named profile
   on the SAME device/installation. There is no account/password — this is
   just separate, isolated local storage per profile, switched from
   Settings. Nothing here ever leaves the device; it's the same fully
   offline, privacy-first design as before, just split into named buckets. */

function newId() {
    return "id" + Date.now() + Math.random().toString(36).slice(2, 7);
}

function dataKeyFor(profileId) {
    return `myCommitmentData::${profileId}`;
}

function loadProfilesFile() {
    try {
        const raw = localStorage.getItem(PROFILES_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn("Could not read profiles, recreating.", e);
    }
    return null;
}

// One-time migration: if this device has old pre-v5.0 data under the flat
// LEGACY_DATA_KEY and no profiles file yet, wrap that data as the first
// profile ("Me") rather than losing it.
function ensureProfilesFile() {
    let file = loadProfilesFile();
    if (file) return file;

    const defaultId = "p_" + newId();
    const legacyRaw = localStorage.getItem(LEGACY_DATA_KEY);
    if (legacyRaw) {
        localStorage.setItem(dataKeyFor(defaultId), legacyRaw);
    }

    file = {
        activeProfileId: defaultId,
        profiles: [{ id: defaultId, name: "Me", icon: "👤", createdAt: Date.now() }]
    };
    localStorage.setItem(PROFILES_KEY, JSON.stringify(file));
    return file;
}

function saveProfilesFile(file) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(file));
}

let profilesFile = ensureProfilesFile();

function getActiveProfileId() {
    return profilesFile.activeProfileId;
}

function getActiveProfile() {
    return profilesFile.profiles.find(p => p.id === profilesFile.activeProfileId) || profilesFile.profiles[0];
}

function getProfiles() {
    return profilesFile.profiles;
}

function switchProfile(id) {
    if (!profilesFile.profiles.some(p => p.id === id)) return;
    profilesFile.activeProfileId = id;
    saveProfilesFile(profilesFile);
    data = loadData();
    activeMonthKey = monthKeyFromDate(new Date());
    ensureMonth(activeMonthKey);
    renderAll();
    renderProfileChip();
}

function addProfile(name, icon) {
    const id = "p_" + newId();
    profilesFile.profiles.push({ id, name, icon: icon || "👤", createdAt: Date.now() });
    saveProfilesFile(profilesFile);
    return id;
}

function updateProfile(id, name, icon) {
    const p = profilesFile.profiles.find(x => x.id === id);
    if (!p) return;
    p.name = name;
    p.icon = icon || "👤";
    saveProfilesFile(profilesFile);
}

function deleteProfile(id) {
    if (profilesFile.profiles.length <= 1) {
        alert("You need at least one profile.");
        return false;
    }
    profilesFile.profiles = profilesFile.profiles.filter(p => p.id !== id);
    localStorage.removeItem(dataKeyFor(id));
    if (profilesFile.activeProfileId === id) {
        profilesFile.activeProfileId = profilesFile.profiles[0].id;
    }
    saveProfilesFile(profilesFile);
    return true;
}

/* ---------- persistence (per active profile) ---------- */

let data = loadData();
let activeMonthKey = monthKeyFromDate(new Date());

// While the entry modal is open: which list it edits and which item (null = adding new)
let editingEntry = { kind: "commitment", id: null };

ensureMonth(activeMonthKey);

function loadData() {
    try {
        const raw = localStorage.getItem(dataKeyFor(getActiveProfileId()));
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                if (!parsed.settings) parsed.settings = { currency: "RM" };
                if (!parsed.settings.permanentIncome) {
                    parsed.settings.permanentIncome = { enabled: false, name: "Salary", icon: "💼", amount: 0, receivedDate: 1 };
                }
                if (!parsed.months) parsed.months = {};
                if (!Array.isArray(parsed.accounts)) parsed.accounts = [];
                if (!Array.isArray(parsed.accountTransactions)) parsed.accountTransactions = [];
                if (!Array.isArray(parsed.goals)) parsed.goals = [];
                if (!Array.isArray(parsed.items)) parsed.items = [];
                migrateData(parsed);
                return parsed;
            }
        }
    } catch (e) {
        console.warn("Could not read saved data, starting fresh.", e);
    }
    return {
        settings: { currency: "RM", permanentIncome: { enabled: false, name: "Salary", icon: "💼", amount: 0, receivedDate: 1 } },
        months: {}, accounts: [], accountTransactions: [], goals: [], items: []
    };
}

// Keeps older backups working as the data model grows. Never drops a record —
// only fills in fields that didn't exist yet, with safe defaults.
function migrateData(parsed) {
    Object.values(parsed.months).forEach(month => {
        if (!Array.isArray(month.incomes)) {
            const legacyIncome = typeof month.income === "number" ? month.income : 0;
            month.incomes = legacyIncome > 0
                ? [{ id: newId(), icon: "💼", name: "Income", amount: legacyIncome, receivedDate: 1, updatedAt: 0 }]
                : [];
            delete month.income;
        }
        if (!Array.isArray(month.commitments)) {
            month.commitments = [];
        }
        if (!Array.isArray(month.savingsTransactions)) {
            month.savingsTransactions = [];
        }
        if (!Array.isArray(month.paymentLog)) {
            month.paymentLog = [];
        }
        if (!Array.isArray(month.quickEntries)) {
            month.quickEntries = [];
        }
        month.quickEntries.forEach(q => {
            if (q.updatedAt === undefined) q.updatedAt = 0;
            if (q.type === "expense" && !q.category) q.category = "others";
        });
        month.incomes.forEach(i => {
            if (i.updatedAt === undefined) i.updatedAt = 0;
            if (!i.receivedDate) i.receivedDate = 1;
        });
        month.commitments.forEach(c => {
            if (c.category === undefined) c.category = "others";
            if (c.type === undefined) c.type = "recurring";
            // Commitments created before payment tracking existed are assumed
            // already settled, so they don't suddenly show up as "unpaid".
            if (c.paidAmount === undefined) c.paidAmount = c.amount;
            if (c.dueDate === undefined) c.dueDate = "";
            if (c.notes === undefined) c.notes = "";
            if (c.carriedNote === undefined) c.carriedNote = "";
            if (c.updatedAt === undefined) c.updatedAt = 0;
        });
        month.savingsTransactions.forEach(t => {
            if (t.updatedAt === undefined) t.updatedAt = 0;
            if (t.note === undefined) t.note = "";
        });
    });

    // v5.0: multi-account net worth replaces the single global Saving
    // Balance. Run ONCE per profile: fold the old auto-computed balance and
    // every month's manual deposit/withdraw log into one new "Savings" cash
    // account, so nothing already tracked is lost. Old savingsTransactions
    // arrays are left in place afterwards (harmless, just unused) rather
    // than deleted, in case anything ever needs to reference them again.
    if (!parsed.migratedToAccounts) {
        const legacyBalance = Object.keys(parsed.months)
            .sort()
            .reduce((sum, k) => sum + legacyNetSavingForMonth(parsed, k), 0);

        if (legacyBalance !== 0 || Object.values(parsed.months).some(m => (m.savingsTransactions || []).length)) {
            const accountId = "acc_" + newId();
            parsed.accounts.push({
                id: accountId,
                name: "Savings",
                icon: "💰",
                type: "cash",
                balance: legacyBalance,
                createdAt: 0,
                updatedAt: 0
            });

            Object.keys(parsed.months).sort().forEach(k => {
                (parsed.months[k].savingsTransactions || []).forEach(t => {
                    parsed.accountTransactions.push({
                        id: "atx_" + newId(),
                        accountId,
                        type: t.type,
                        amount: t.amount,
                        note: t.note || "",
                        date: t.date || (k + "-01"),
                        updatedAt: t.updatedAt || 0
                    });
                });
            });
        }

        parsed.migratedToAccounts = true;
    }
}

// Recomputes what getMonthTotals().netSaving would have returned under the
// pre-v5.0 model, for the one-time migration above only.
function legacyNetSavingForMonth(parsed, key) {
    const month = parsed.months[key];
    const totalIncome = month.incomes.reduce((sum, i) => sum + i.amount, 0);
    const totalCommitment = month.commitments.reduce((sum, c) => sum + c.amount, 0);
    const savingsAdjustment = (month.savingsTransactions || [])
        .reduce((sum, t) => sum + (t.type === "deposit" ? t.amount : -t.amount), 0);
    return (totalIncome - totalCommitment) + savingsAdjustment;
}

function saveData() {
    localStorage.setItem(dataKeyFor(getActiveProfileId()), JSON.stringify(data));
}

function ensureMonth(key) {
    if (!data.months[key]) {
        data.months[key] = { incomes: [], commitments: [], savingsTransactions: [], paymentLog: [], quickEntries: [] };
        seedPermanentIncome(data.months[key].incomes);
    }
    if (!data.months[key].savingsTransactions) {
        data.months[key].savingsTransactions = [];
    }
    if (!data.months[key].paymentLog) {
        data.months[key].paymentLog = [];
    }
    if (!data.months[key].quickEntries) {
        data.months[key].quickEntries = [];
    }
    return data.months[key];
}

// If a permanent salary is set up in Settings and not already present
// (matched by name) in the given incomes list, adds a fresh copy of it.
// Used both when a brand new month is first touched (above) and when
// "+ New Month" builds its carried-forward income list, so the salary is
// never missing from a new month regardless of how that month came to be.
function seedPermanentIncome(incomesList) {
    const salary = data.settings.permanentIncome;
    if (!salary || !salary.enabled) return incomesList;
    const already = incomesList.some(i => i.name.trim().toLowerCase() === salary.name.trim().toLowerCase());
    if (already) return incomesList;
    incomesList.push({
        id: newId(),
        icon: salary.icon || "💼",
        name: salary.name || "Salary",
        amount: salary.amount || 0,
        receivedDate: salary.receivedDate || 1,
        updatedAt: Date.now()
    });
    return incomesList;
}

/* ---------- month key / date helpers ---------- */

function pad2(n) {
    return n.toString().padStart(2, "0");
}

function monthKeyFromDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function shiftMonthKey(key, delta) {
    let [y, m] = key.split("-").map(Number);
    m += delta;
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    return `${y}-${pad2(m)}`;
}

function shiftDueDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function daysInMonth(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m, 0).getDate();
}

/* ---------- categories ---------- */

function getCategoryInfo(id) {
    return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

function getCategoryTotals(key) {
    const month = ensureMonth(key);
    const totals = {};
    CATEGORIES.forEach(cat => { totals[cat.id] = 0; });
    month.commitments.forEach(c => {
        const id = totals.hasOwnProperty(c.category) ? c.category : "others";
        totals[id] += c.amount;
    });
    month.quickEntries.filter(q => q.type === "expense").forEach(q => {
        const id = totals.hasOwnProperty(q.category) ? q.category : "others";
        totals[id] += q.amount;
    });
    return totals;
}

// Income broken down by source name — recurring income sources and any
// quick-logged income for the month, combined when they share a name.
const INCOME_PALETTE = ["#30d158", "#4c6fff", "#ffd60a", "#ff9f43", "#a78bfa", "#ff6b6b", "#2ecc71", "#64d2ff"];

function getIncomeBreakdown(key) {
    const month = ensureMonth(key);
    const byName = new Map();

    function add(name, icon, amount) {
        const existing = byName.get(name);
        if (existing) existing.total += amount;
        else byName.set(name, { name, icon, total: amount });
    }

    month.incomes.forEach(i => add(i.name, i.icon || "💼", i.amount));
    month.quickEntries.filter(q => q.type === "income").forEach(q => add(q.name, q.icon || "💵", q.amount));

    return Array.from(byName.values())
        .sort((a, b) => b.total - a.total)
        .map((entry, idx) => ({ ...entry, color: INCOME_PALETTE[idx % INCOME_PALETTE.length] }));
}

/* ---------- commitment payment status ---------- */

function getCommitmentStatus(c) {
    const paid = c.paidAmount || 0;
    if (paid <= 0) return "unpaid";
    if (paid < c.amount) return "partial";
    return "paid";
}

function isOverdue(c) {
    if (!c.dueDate) return false;
    if (getCommitmentStatus(c) === "paid") return false;
    return c.dueDate < todayStr();
}

function logPayment(monthKey, commitment, amount) {
    const month = ensureMonth(monthKey);
    month.paymentLog.push({
        id: "pay_" + newId(),
        commitmentId: commitment.id,
        name: commitment.name,
        amount,
        date: todayStr(),
        updatedAt: Date.now()
    });
}

/* ---------- calculations ---------- */

function formatMoney(amount) {
    const currency = data.settings.currency || "RM";
    const sign = amount < 0 ? "-" : "";
    return `${sign}${currency} ${Math.abs(amount).toFixed(2)}`;
}

function formatCompact(amount) {
    const abs = Math.abs(amount);
    let str;
    if (abs >= 1000) str = (abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    else str = Math.round(abs).toString();
    return (amount < 0 ? "-" : "") + str;
}

function getMonthTotals(key) {
    const month = data.months[key] || { incomes: [], commitments: [], quickEntries: [] };
    const quickEntries = month.quickEntries || [];
    const quickIncome = quickEntries.filter(q => q.type === "income").reduce((sum, q) => sum + q.amount, 0);
    const quickExpense = quickEntries.filter(q => q.type === "expense").reduce((sum, q) => sum + q.amount, 0);

    const totalIncome = month.incomes.reduce((sum, i) => sum + i.amount, 0) + quickIncome;
    // Quick expenses are logged at the moment they happen (like "what I paid
    // today"), so unlike a Commitment they have no separate "unpaid" state —
    // they count as both committed AND already paid immediately.
    const totalCommitment = month.commitments.reduce((sum, c) => sum + c.amount, 0) + quickExpense;
    const totalPaid = month.commitments.reduce((sum, c) => sum + (c.paidAmount || 0), 0) + quickExpense;
    const saving = totalIncome - totalCommitment;
    return {
        totalIncome,
        totalCommitment,
        totalPaid,
        saving,
        availableBalance: totalIncome - totalPaid
    };
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

/* ================= ACCOUNTS (Wallet tab) — replaces old Saving Balance ================= */
/* Balances here are manually maintained, like a real bank balance — there is
   no API that can read your actual bank/e-wallet balance automatically, so
   you set it once and keep it current with Deposit/Withdraw, the same way
   the old Savings tab worked but split across named accounts. */

function getAccountTypeInfo(id) {
    return ACCOUNT_TYPES.find(t => t.id === id) || ACCOUNT_TYPES[0];
}

function getNetWorth() {
    let assets = 0, debt = 0;
    data.accounts.forEach(a => {
        if (a.type === "debt") debt += a.balance;
        else assets += a.balance;
    });
    return { assets, debt, net: assets - debt };
}

function addAccount(fields) {
    data.accounts.push({ id: "acc_" + newId(), createdAt: Date.now(), updatedAt: Date.now(), ...fields });
    saveData();
}

function updateAccount(id, fields) {
    const a = data.accounts.find(x => x.id === id);
    if (!a) return;
    Object.assign(a, fields, { updatedAt: Date.now() });
    saveData();
}

function deleteAccount(id) {
    if (!confirm("Delete this account? Its transaction history will also be removed.")) return;
    data.accounts = data.accounts.filter(a => a.id !== id);
    data.accountTransactions = data.accountTransactions.filter(t => t.accountId !== id);
    saveData();
    renderWallet();
}

function recordAccountTransaction(accountId, type, amount, note) {
    const account = data.accounts.find(a => a.id === accountId);
    if (!account) return;

    // For a debt/credit account, a "deposit" (paying it down) REDUCES the
    // balance owed, and a "withdraw" (spending more on it) increases it —
    // the opposite of a cash/bank account, where deposit adds and withdraw
    // subtracts.
    const sign = account.type === "debt" ? -1 : 1;
    account.balance += sign * (type === "deposit" ? amount : -amount);
    account.updatedAt = Date.now();

    data.accountTransactions.push({
        id: "atx_" + newId(), accountId, type, amount, note: note || "",
        date: todayStr(), updatedAt: Date.now()
    });
    saveData();
}

function renderAccountsPane() {
    const nw = getNetWorth();
    document.getElementById("netAssetsValue").textContent = formatMoney(nw.net);
    document.getElementById("netAssetsPositiveValue").textContent = formatMoney(nw.assets);
    document.getElementById("netDebtValue").textContent = formatMoney(nw.debt);

    const container = document.getElementById("accountGroups");
    container.innerHTML = "";
    document.getElementById("accountsEmptyState").hidden = data.accounts.length > 0;

    const groups = [
        { id: "cash", title: "Cash & E-Wallets", types: ["cash", "ewallet"] },
        { id: "bank", title: "Bank Accounts", types: ["bank"] },
        { id: "debt", title: "Debt", types: ["debt"] }
    ];

    groups.forEach(group => {
        const accounts = data.accounts.filter(a => group.types.includes(a.type));
        if (accounts.length === 0) return;

        const groupTotal = accounts.reduce((sum, a) => sum + a.balance, 0);
        const section = document.createElement("div");
        section.className = "account-group";
        section.innerHTML = `<div class="account-group-title"><span>${group.title}</span><span>${formatMoney(groupTotal)}</span></div>`;

        accounts.forEach(a => {
            const row = document.createElement("div");
            row.className = "item account-item";
            row.innerHTML = `
                <div class="account-main">
                    <span class="account-icon">${a.icon || getAccountTypeInfo(a.type).icon}</span>
                    <span class="account-name">${escapeHtml(a.name)}</span>
                </div>
                <strong class="${a.type === "debt" ? "negative" : ""}">${formatMoney(a.balance)}</strong>
                <div class="item-actions">
                    <button class="pay-btn" title="Deposit">➕</button>
                    <button class="pay-btn" title="Withdraw">➖</button>
                </div>
            `;
            row.querySelector(".account-main").addEventListener("click", () => openAccountModal(a.id));
            const [depositBtn, withdrawBtn] = row.querySelectorAll(".pay-btn");
            depositBtn.addEventListener("click", e => { e.stopPropagation(); openAccountTxModal(a.id, "deposit"); });
            withdrawBtn.addEventListener("click", e => { e.stopPropagation(); openAccountTxModal(a.id, "withdraw"); });
            section.appendChild(row);
        });

        container.appendChild(section);
    });
}

function openAccountModal(id) {
    editingAccountId = id || null;
    const title = document.getElementById("accountModalTitle");
    const iconInput = document.getElementById("accountIcon");
    const nameInput = document.getElementById("accountName");
    const typeInput = document.getElementById("accountType");
    const balanceInput = document.getElementById("accountBalance");
    const deleteBtn = document.getElementById("deleteAccountBtn");

    if (id) {
        const a = data.accounts.find(x => x.id === id);
        title.textContent = "Edit Account";
        iconInput.value = a.icon || "";
        nameInput.value = a.name;
        typeInput.value = a.type;
        balanceInput.value = a.balance;
        deleteBtn.hidden = false;
    } else {
        title.textContent = "Add Account";
        iconInput.value = "";
        nameInput.value = "";
        typeInput.value = "cash";
        balanceInput.value = "0";
        deleteBtn.hidden = true;
    }

    document.getElementById("accountModal").hidden = false;
    nameInput.focus();
}

function closeAccountModal() {
    document.getElementById("accountModal").hidden = true;
    editingAccountId = null;
}

let editingAccountId = null;

function saveAccountFromModal() {
    const name = document.getElementById("accountName").value.trim();
    const icon = document.getElementById("accountIcon").value.trim();
    const type = document.getElementById("accountType").value;
    const balance = parseFloat(document.getElementById("accountBalance").value);

    if (!name) { alert("Please enter a name."); return; }
    if (isNaN(balance)) { alert("Please enter a valid balance."); return; }

    const fields = { name, icon: icon || getAccountTypeInfo(type).icon, type, balance };
    if (editingAccountId) updateAccount(editingAccountId, fields);
    else addAccount(fields);

    closeAccountModal();
    renderWallet();
}

let editingAccountTx = { accountId: null, type: "deposit" };

function openAccountTxModal(accountId, type) {
    editingAccountTx = { accountId, type };
    const account = data.accounts.find(a => a.id === accountId);
    const debtWord = account && account.type === "debt";
    document.getElementById("accountTxModalTitle").textContent =
        type === "deposit" ? (debtWord ? "Pay Down" : "Deposit") : (debtWord ? "Add Charge" : "Withdraw");
    document.getElementById("accountTxAmount").value = "";
    document.getElementById("accountTxNote").value = "";
    document.getElementById("accountTxModal").hidden = false;
    document.getElementById("accountTxAmount").focus();
}

function closeAccountTxModal() {
    document.getElementById("accountTxModal").hidden = true;
}

function saveAccountTxFromModal() {
    const amount = parseFloat(document.getElementById("accountTxAmount").value);
    const note = document.getElementById("accountTxNote").value.trim();
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount."); return; }

    recordAccountTransaction(editingAccountTx.accountId, editingAccountTx.type, amount, note);
    closeAccountTxModal();
    renderWallet();
}

/* ================= GOALS (Wallet tab) ================= */
/* Independent of Accounts — a goal is a target you track progress against
   via its own manual deposit/withdraw log, not an automatic split of
   leftover income. */

function addGoal(fields) {
    data.goals.push({ id: "goal_" + newId(), savedAmount: 0, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
    saveData();
}

function updateGoal(id, fields) {
    const g = data.goals.find(x => x.id === id);
    if (!g) return;
    Object.assign(g, fields, { updatedAt: Date.now() });
    saveData();
}

function deleteGoal(id) {
    if (!confirm("Delete this goal?")) return;
    data.goals = data.goals.filter(g => g.id !== id);
    saveData();
    renderWallet();
}

function contributeToGoal(id, type, amount) {
    const g = data.goals.find(x => x.id === id);
    if (!g) return;
    g.savedAmount = Math.max(0, g.savedAmount + (type === "deposit" ? amount : -amount));
    g.updatedAt = Date.now();
    saveData();
}

function renderGoalsPane() {
    const list = document.getElementById("goalList");
    list.innerHTML = "";
    document.getElementById("goalsEmptyState").hidden = data.goals.length > 0;

    data.goals.forEach(g => {
        const pct = g.target > 0 ? Math.min(100, Math.round((g.savedAmount / g.target) * 100)) : 0;
        const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000) : null;

        const row = document.createElement("div");
        row.className = "item goal-item";
        row.innerHTML = `
            <div class="goal-main">
                <div class="item-top">
                    <span>${g.icon || "🎯"} ${escapeHtml(g.name)}</span>
                    <strong>${formatMoney(g.savedAmount)} <span class="goal-target-of">/ ${formatMoney(g.target)}</span></strong>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                <div class="item-meta">
                    <span class="tag">${pct}% complete</span>
                    ${daysLeft !== null ? `<span class="tag${daysLeft < 0 ? " overdue" : ""}">${daysLeft < 0 ? "⚠️ Past deadline" : `📅 ${daysLeft}d left`}</span>` : ""}
                </div>
            </div>
            <div class="item-actions">
                <button class="pay-btn" title="Add funds">➕</button>
                <button class="pay-btn" title="Withdraw">➖</button>
                <button class="delete-btn" aria-label="Delete goal">✕</button>
            </div>
        `;
        row.querySelector(".goal-main").addEventListener("click", () => openGoalModal(g.id));
        const [addBtn, withdrawBtn] = row.querySelectorAll(".pay-btn");
        addBtn.addEventListener("click", e => { e.stopPropagation(); openGoalTxModal(g.id, "deposit"); });
        withdrawBtn.addEventListener("click", e => { e.stopPropagation(); openGoalTxModal(g.id, "withdraw"); });
        row.querySelector(".delete-btn").addEventListener("click", e => { e.stopPropagation(); deleteGoal(g.id); });
        list.appendChild(row);
    });
}

let editingGoalId = null;

function openGoalModal(id) {
    editingGoalId = id || null;
    const title = document.getElementById("goalModalTitle");
    const iconInput = document.getElementById("goalIcon");
    const nameInput = document.getElementById("goalName");
    const targetInput = document.getElementById("goalTarget");
    const deadlineInput = document.getElementById("goalDeadline");
    const deleteBtn = document.getElementById("deleteGoalBtn");

    if (id) {
        const g = data.goals.find(x => x.id === id);
        title.textContent = "Edit Goal";
        iconInput.value = g.icon || "";
        nameInput.value = g.name;
        targetInput.value = g.target;
        deadlineInput.value = g.deadline || "";
        deleteBtn.hidden = false;
    } else {
        title.textContent = "Add Goal";
        iconInput.value = "";
        nameInput.value = "";
        targetInput.value = "";
        deadlineInput.value = "";
        deleteBtn.hidden = true;
    }

    document.getElementById("goalModal").hidden = false;
    nameInput.focus();
}

function closeGoalModal() {
    document.getElementById("goalModal").hidden = true;
    editingGoalId = null;
}

function saveGoalFromModal() {
    const name = document.getElementById("goalName").value.trim();
    const icon = document.getElementById("goalIcon").value.trim();
    const target = parseFloat(document.getElementById("goalTarget").value);
    const deadline = document.getElementById("goalDeadline").value;

    if (!name) { alert("Please enter a name."); return; }
    if (isNaN(target) || target <= 0) { alert("Please enter a valid target amount."); return; }

    const fields = { name, icon: icon || "🎯", target, deadline };
    if (editingGoalId) updateGoal(editingGoalId, fields);
    else addGoal(fields);

    closeGoalModal();
    renderWallet();
}

let editingGoalTx = { goalId: null, type: "deposit" };

function openGoalTxModal(goalId, type) {
    editingGoalTx = { goalId, type };
    document.getElementById("goalTxModalTitle").textContent = type === "deposit" ? "Add to Goal" : "Withdraw from Goal";
    document.getElementById("goalTxAmount").value = "";
    document.getElementById("goalTxModal").hidden = false;
    document.getElementById("goalTxAmount").focus();
}

function closeGoalTxModal() {
    document.getElementById("goalTxModal").hidden = true;
}

function saveGoalTxFromModal() {
    const amount = parseFloat(document.getElementById("goalTxAmount").value);
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount."); return; }
    contributeToGoal(editingGoalTx.goalId, editingGoalTx.type, amount);
    closeGoalTxModal();
    renderWallet();
}

/* ================= ITEMS (Wallet tab) — assets & wishlist ================= */
/* Informational tracking, kept separate from the Net Assets figure above
   (which mirrors real bank/cash balances) so nothing gets double-counted. */

function addItem(fields) {
    data.items.push({ id: "item_" + newId(), createdAt: Date.now(), updatedAt: Date.now(), ...fields });
    saveData();
}

function updateItem(id, fields) {
    const it = data.items.find(x => x.id === id);
    if (!it) return;
    Object.assign(it, fields, { updatedAt: Date.now() });
    saveData();
}

function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    data.items = data.items.filter(i => i.id !== id);
    saveData();
    renderWallet();
}

function renderItemsPane() {
    const assetList = document.getElementById("assetItemList");
    const wishlistList = document.getElementById("wishlistItemList");
    assetList.innerHTML = "";
    wishlistList.innerHTML = "";

    const assets = data.items.filter(i => i.kind === "asset");
    const wishlist = data.items.filter(i => i.kind === "wishlist");
    document.getElementById("assetItemsEmptyState").hidden = assets.length > 0;
    document.getElementById("wishlistItemsEmptyState").hidden = wishlist.length > 0;

    function makeRow(it) {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
            <span>${it.icon || "📦"} ${escapeHtml(it.name)}</span>
            <strong>${formatMoney(it.amount || 0)}</strong>
            <button class="delete-btn" aria-label="Delete item">✕</button>
        `;
        row.querySelector("span").addEventListener("click", () => openItemModal(it.id));
        row.querySelector("strong").addEventListener("click", () => openItemModal(it.id));
        row.querySelector(".delete-btn").addEventListener("click", e => { e.stopPropagation(); deleteItem(it.id); });
        return row;
    }

    assets.forEach(it => assetList.appendChild(makeRow(it)));
    wishlist.forEach(it => wishlistList.appendChild(makeRow(it)));
}

let editingItemId = null;

function openItemModal(id) {
    editingItemId = id || null;
    const title = document.getElementById("itemModalTitle");
    const kindInput = document.getElementById("itemKind");
    const iconInput = document.getElementById("itemIcon");
    const nameInput = document.getElementById("itemName");
    const amountInput = document.getElementById("itemAmount");
    const notesInput = document.getElementById("itemNotes");
    const deleteBtn = document.getElementById("deleteItemBtn");

    if (id) {
        const it = data.items.find(x => x.id === id);
        title.textContent = "Edit Item";
        kindInput.value = it.kind;
        iconInput.value = it.icon || "";
        nameInput.value = it.name;
        amountInput.value = it.amount || 0;
        notesInput.value = it.notes || "";
        deleteBtn.hidden = false;
    } else {
        title.textContent = "Add Item";
        kindInput.value = "asset";
        iconInput.value = "";
        nameInput.value = "";
        amountInput.value = "";
        notesInput.value = "";
        deleteBtn.hidden = true;
    }
    updateItemAmountLabel();

    document.getElementById("itemModal").hidden = false;
    nameInput.focus();
}

function updateItemAmountLabel() {
    const kind = document.getElementById("itemKind").value;
    document.getElementById("itemAmountLabel").textContent = kind === "asset" ? "Estimated Value" : "Target Price";
}

function closeItemModal() {
    document.getElementById("itemModal").hidden = true;
    editingItemId = null;
}

function saveItemFromModal() {
    const kind = document.getElementById("itemKind").value;
    const name = document.getElementById("itemName").value.trim();
    const icon = document.getElementById("itemIcon").value.trim();
    const amount = parseFloat(document.getElementById("itemAmount").value) || 0;
    const notes = document.getElementById("itemNotes").value.trim();

    if (!name) { alert("Please enter a name."); return; }

    const fields = { kind, name, icon: icon || (kind === "asset" ? "📦" : "⭐"), amount, notes };
    if (editingItemId) updateItem(editingItemId, fields);
    else addItem(fields);

    closeItemModal();
    renderWallet();
}

/* ================= WALLET (sub-tab container) ================= */

let activeWalletTab = "accounts";

function switchWalletTab(tab) {
    activeWalletTab = tab;
    ["accounts", "goals", "items"].forEach(t => {
        document.getElementById("wallet-" + t).hidden = t !== tab;
    });
    document.querySelectorAll("#walletTabs .segmented-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.walletTab === tab);
    });
}

function renderWallet() {
    renderAccountsPane();
    renderGoalsPane();
    renderItemsPane();
}

/* ================= CALENDAR (Home view) ================= */
/* Built from data the app already dates precisely: income "received on"
   day-of-month, and commitment payments logged the moment you tap Pay /
   Mark Paid (see logPayment above). This is the same underlying money as
   the Income/Expense cards above it — just spread across the days it
   actually happened, instead of one monthly total. */

function getDayTotals(key, day) {
    const month = ensureMonth(key);
    const quickIncome = month.quickEntries.filter(q => q.type === "income" && Number(q.date.slice(8, 10)) === day)
        .reduce((sum, q) => sum + q.amount, 0);
    const quickExpense = month.quickEntries.filter(q => q.type === "expense" && Number(q.date.slice(8, 10)) === day)
        .reduce((sum, q) => sum + q.amount, 0);
    const income = month.incomes
        .filter(i => (i.receivedDate || 1) === day)
        .reduce((sum, i) => sum + i.amount, 0) + quickIncome;
    const expense = month.paymentLog
        .filter(p => Number(p.date.slice(8, 10)) === day)
        .reduce((sum, p) => sum + p.amount, 0) + quickExpense;
    return { income, expense };
}

// Everything tied to one specific day, for the tap-a-day detail popup: which
// income landed, which payments were actually made, which commitments are
// due (whether paid yet or not), and any quick-logged income/expense for
// that exact day — the daily +/- total on its own can't show any of this.
function getDayDetail(key, day) {
    const month = ensureMonth(key);
    const dateStr = `${key}-${pad2(day)}`;
    const incomes = month.incomes.filter(i => (i.receivedDate || 1) === day);
    const payments = month.paymentLog.filter(p => Number(p.date.slice(8, 10)) === day);
    const due = month.commitments.filter(c => c.dueDate === dateStr);
    const quickIncomes = month.quickEntries.filter(q => q.type === "income" && q.date === dateStr);
    const quickExpenses = month.quickEntries.filter(q => q.type === "expense" && q.date === dateStr);
    return { incomes, payments, due, quickIncomes, quickExpenses };
}

function hasDueUnpaidOn(key, day) {
    const dateStr = `${key}-${pad2(day)}`;
    return ensureMonth(key).commitments.some(c => c.dueDate === dateStr && getCommitmentStatus(c) !== "paid");
}

function renderCalendar() {
    const grid = document.getElementById("calendarGrid");
    grid.innerHTML = "";

    const [y, m] = activeMonthKey.split("-").map(Number);
    const firstOfMonth = new Date(y, m - 1, 1);
    // Monday-first weekday index (0 = Mon ... 6 = Sun)
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
    const totalDays = daysInMonth(activeMonthKey);
    const isCurrentRealMonth = activeMonthKey === monthKeyFromDate(new Date());
    const todayDate = new Date().getDate();

    for (let i = 0; i < leadingBlanks; i++) {
        const blank = document.createElement("div");
        blank.className = "calendar-cell calendar-cell-blank";
        grid.appendChild(blank);
    }

    for (let day = 1; day <= totalDays; day++) {
        const { income, expense } = getDayTotals(activeMonthKey, day);
        const net = income - expense;
        const dueUnpaid = hasDueUnpaidOn(activeMonthKey, day);
        const cell = document.createElement("div");
        cell.className = "calendar-cell";
        if (isCurrentRealMonth && day === todayDate) cell.classList.add("calendar-today");
        if (net > 0) cell.classList.add("calendar-positive");
        else if (net < 0) cell.classList.add("calendar-negative");

        cell.innerHTML = `
            <span class="calendar-day-num">${day}</span>
            ${income > 0 ? `<span class="calendar-amt calendar-amt-pos">+${formatCompact(income)}</span>` : ""}
            ${expense > 0 ? `<span class="calendar-amt calendar-amt-neg">-${formatCompact(expense)}</span>` : ""}
            ${dueUnpaid ? `<span class="calendar-due-dot"></span>` : ""}
        `;
        cell.addEventListener("click", () => openDayDetailModal(day));
        grid.appendChild(cell);
    }
}

/* ---------- Calendar day detail modal ---------- */
/* "What I pay/earn today": quick, one-off dated income or expense entries,
   separate from the formal monthly Income Sources / Commitments lists —
   for things like a one-time cash purchase or a bit of unplanned income
   that don't belong as a recurring monthly line item. */

let openDayDetailDate = null; // "YYYY-MM-DD" of the day the modal is currently showing

function openDayDetailModal(day) {
    openDayDetailDate = `${activeMonthKey}-${pad2(day)}`;
    document.getElementById("dayDetailTitle").textContent = formatDate(openDayDetailDate);
    renderDayDetailModal();
    document.getElementById("dayDetailModal").hidden = false;
}

function renderDayDetailModal() {
    if (!openDayDetailDate) return;
    const day = Number(openDayDetailDate.slice(8, 10));
    const { incomes, payments, due, quickIncomes, quickExpenses } = getDayDetail(activeMonthKey, day);

    const rows = [];
    incomes.forEach(i => rows.push(`
        <div class="item">
            <span>${i.icon || "💼"} ${escapeHtml(i.name)} <span class="tag">Income source</span></span>
            <strong class="positive">+${formatMoney(i.amount)}</strong>
        </div>
    `));
    quickIncomes.forEach(q => rows.push(`
        <div class="item">
            <span>${q.icon || "💵"} ${escapeHtml(q.name)}</span>
            <strong class="positive">+${formatMoney(q.amount)}</strong>
            <button class="delete-btn" data-quick-id="${q.id}" aria-label="Delete">✕</button>
        </div>
    `));
    payments.forEach(p => rows.push(`
        <div class="item">
            <span>💵 Paid: ${escapeHtml(p.name)}</span>
            <strong class="negative">-${formatMoney(p.amount)}</strong>
        </div>
    `));
    quickExpenses.forEach(q => rows.push(`
        <div class="item">
            <span>${q.icon || "📦"} ${escapeHtml(q.name)} <span class="tag">${getCategoryInfo(q.category).icon} ${getCategoryInfo(q.category).label}</span></span>
            <strong class="negative">-${formatMoney(q.amount)}</strong>
            <button class="delete-btn" data-quick-id="${q.id}" aria-label="Delete">✕</button>
        </div>
    `));
    due.forEach(c => {
        const status = getCommitmentStatus(c);
        rows.push(`
            <div class="item">
                <span>${c.icon || "💳"} ${escapeHtml(c.name)} <span class="tag status-tag status-${status}">${status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Unpaid"}</span></span>
                <strong>${formatMoney(c.amount)}<span class="upcoming-date"> due</span></strong>
            </div>
        `);
    });

    const list = document.getElementById("dayDetailList");
    list.innerHTML = rows.join("");
    list.querySelectorAll(".delete-btn[data-quick-id]").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            deleteQuickEntry(btn.dataset.quickId);
        });
    });
    document.getElementById("dayDetailEmpty").hidden = rows.length > 0;
}

function closeDayDetailModal() {
    document.getElementById("dayDetailModal").hidden = true;
    openDayDetailDate = null;
}

/* ---------- Quick entry (dated income/expense) modal ---------- */

let editingQuickEntry = { type: "expense", date: null };

function openQuickEntryModal(type) {
    editingQuickEntry = { type, date: openDayDetailDate };
    document.getElementById("quickEntryModalTitle").textContent =
        type === "income" ? `Add Income — ${formatDate(openDayDetailDate)}` : `Add Expense — ${formatDate(openDayDetailDate)}`;
    document.getElementById("quickEntryIcon").value = "";
    document.getElementById("quickEntryIcon").placeholder = type === "income" ? "💵" : "📦";
    document.getElementById("quickEntryName").value = "";
    document.getElementById("quickEntryAmount").value = "";
    document.getElementById("quickEntryCategoryRow").hidden = type !== "expense";
    document.getElementById("quickEntryCategory").value = "others";
    document.getElementById("quickEntryModal").hidden = false;
    document.getElementById("quickEntryName").focus();
}

function closeQuickEntryModal() {
    document.getElementById("quickEntryModal").hidden = true;
}

function saveQuickEntryFromModal() {
    const name = document.getElementById("quickEntryName").value.trim();
    const icon = document.getElementById("quickEntryIcon").value.trim();
    const amount = parseFloat(document.getElementById("quickEntryAmount").value);
    if (!name) { alert("Please enter a name."); return; }
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount."); return; }

    const { type, date } = editingQuickEntry;
    const month = ensureMonth(date.slice(0, 7));
    const fields = {
        id: "q_" + newId(),
        type, name, icon: icon || (type === "income" ? "💵" : "📦"),
        amount, date, updatedAt: Date.now()
    };
    if (type === "expense") fields.category = document.getElementById("quickEntryCategory").value;

    month.quickEntries.push(fields);
    saveData();
    closeQuickEntryModal();
    renderDayDetailModal();
    renderHome();
    if (!document.getElementById("view-breakdown").hidden) renderBreakdown();
}

function deleteQuickEntry(id) {
    if (!confirm("Delete this entry?")) return;
    const month = ensureMonth(openDayDetailDate.slice(0, 7));
    month.quickEntries = month.quickEntries.filter(q => q.id !== id);
    saveData();
    renderDayDetailModal();
    renderHome();
    if (!document.getElementById("view-breakdown").hidden) renderBreakdown();
}

function closeDayDetailModal() {
    document.getElementById("dayDetailModal").hidden = true;
}

/* ================= BREAKDOWN (Expense pie chart view) ================= */

let activeBreakdownTab = "expense";

function switchBreakdownTab(tab) {
    activeBreakdownTab = tab;
    document.querySelectorAll("#breakdownTabs .segmented-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.breakdownTab === tab);
    });
    renderBreakdown();
}

function renderBreakdown() {
    document.getElementById("breakdownMonthLabel").textContent = monthLabel(activeMonthKey);
    document.getElementById("breakdownHeading").textContent =
        activeBreakdownTab === "income" ? "Income Breakdown" : "Expense Breakdown";
    document.getElementById("breakdownEmptyState").textContent =
        activeBreakdownTab === "income" ? "No income recorded this month yet." : "No expenses recorded this month yet.";

    let entries;
    if (activeBreakdownTab === "income") {
        entries = getIncomeBreakdown(activeMonthKey)
            .map(e => ({ ...e, label: e.name }))
            .filter(e => e.total > 0);
    } else {
        const totals = getCategoryTotals(activeMonthKey);
        entries = CATEGORIES.map(cat => ({ ...cat, total: totals[cat.id] })).filter(c => c.total > 0);
    }

    const grandTotal = entries.reduce((sum, e) => sum + e.total, 0);

    document.getElementById("breakdownTotalValue").textContent = formatMoney(grandTotal);

    const pie = document.getElementById("pieChart");
    const legend = document.getElementById("breakdownLegend");
    document.getElementById("breakdownEmptyState").hidden = entries.length > 0;

    if (entries.length === 0) {
        pie.style.background = "var(--card-alt)";
        legend.innerHTML = "";
        return;
    }

    let cursor = 0;
    const stops = entries.map(e => {
        const pct = (e.total / grandTotal) * 100;
        const stop = `${e.color} ${cursor}% ${cursor + pct}%`;
        cursor += pct;
        return stop;
    });
    pie.style.background = `conic-gradient(${stops.join(", ")})`;

    legend.innerHTML = entries
        .sort((a, b) => b.total - a.total)
        .map(e => {
            const pct = Math.round((e.total / grandTotal) * 100);
            return `
                <div class="legend-row">
                    <span class="legend-dot" style="background:${e.color}"></span>
                    <span class="legend-label">${e.icon} ${e.label}</span>
                    <span class="legend-amount">${formatMoney(e.total)}</span>
                    <span class="legend-pct">${pct}%</span>
                </div>
            `;
        }).join("");
}

/* ================= RECURRING (drill-in view) ================= */

function renderRecurring() {
    const month = ensureMonth(activeMonthKey);
    const recurring = month.commitments.filter(c => c.type !== "one-time");

    const monthlyTotal = recurring.reduce((sum, c) => sum + c.amount, 0);
    const leftThisMonth = recurring.reduce((sum, c) => sum + Math.max(0, c.amount - (c.paidAmount || 0)), 0);

    document.getElementById("recurringMonthlyValue").textContent = formatMoney(monthlyTotal);
    document.getElementById("recurringLeftValue").textContent = formatMoney(leftThisMonth);
    document.getElementById("recurringYearlyValue").textContent = formatMoney(monthlyTotal * 12);
    document.getElementById("recurringActiveValue").textContent = String(recurring.length);

    // Next 7 real calendar days, regardless of which month is active on screen.
    const strip = document.getElementById("recurringNext7Strip");
    strip.innerHTML = "";
    const next7 = [];
    const base = new Date();
    for (let i = 0; i < 7; i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        next7.push(d);
        const cell = document.createElement("div");
        cell.className = "next7-cell" + (i === 0 ? " next7-today" : "");
        cell.innerHTML = `<span>${d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3)}</span><strong>${d.getDate()}</strong>`;
        strip.appendChild(cell);
    }
    const next7Keys = next7.map(d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);

    // Recurring commitments due within the next 7 days can live in the
    // CURRENT real month's data even if a different month is on screen.
    const currentRealMonth = ensureMonth(monthKeyFromDate(new Date()));
    const upcoming = currentRealMonth.commitments
        .filter(c => c.type !== "one-time" && c.dueDate && next7Keys.includes(c.dueDate) && getCommitmentStatus(c) !== "paid")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const upcomingList = document.getElementById("recurringUpcomingList");
    upcomingList.innerHTML = "";
    document.getElementById("recurringEmptyState").hidden = upcoming.length > 0;
    upcoming.forEach(c => {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
            <span>${c.icon || "💳"} ${escapeHtml(c.name)}<br><span class="upcoming-date">${formatDate(c.dueDate)}</span></span>
            <strong>${formatMoney(c.amount)}</strong>
        `;
        upcomingList.appendChild(row);
    });

    const allList = document.getElementById("recurringAllList");
    allList.innerHTML = "";
    recurring.forEach(c => {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
            <span>${c.icon || "💳"} ${escapeHtml(c.name)}</span>
            <strong>${formatMoney(c.amount)}<span class="recurring-permonth">/mo</span></strong>
        `;
        allList.appendChild(row);
    });
}

/* ---------- rendering: income ---------- */

function renderIncomeList() {
    const month = ensureMonth(activeMonthKey);
    const list = document.getElementById("incomeList");
    list.innerHTML = "";
    document.getElementById("incomeEmptyState").hidden = month.incomes.length > 0;

    month.incomes.forEach(entryItem => {
        const el = document.createElement("div");
        el.className = "item";
        el.innerHTML = `
            <span>${entryItem.icon || "💼"} ${escapeHtml(entryItem.name)}</span>
            <strong>${formatMoney(entryItem.amount)}</strong>
            <button class="delete-btn" aria-label="Delete ${escapeHtml(entryItem.name)}">✕</button>
        `;
        el.querySelector("span").addEventListener("click", () => openEntryModal("income", entryItem.id));
        el.querySelector("strong").addEventListener("click", () => openEntryModal("income", entryItem.id));
        el.querySelector(".delete-btn").addEventListener("click", e => {
            e.stopPropagation();
            deleteEntry("income", entryItem.id);
        });
        list.appendChild(el);
    });
}

/* ---------- rendering: commitments ---------- */

function renderCommitmentList() {
    const month = ensureMonth(activeMonthKey);
    const list = document.getElementById("commitmentList");
    list.innerHTML = "";
    document.getElementById("emptyState").hidden = month.commitments.length > 0;

    month.commitments.forEach(c => {
        const status = getCommitmentStatus(c);
        const overdue = isOverdue(c);
        const cat = getCategoryInfo(c.category);

        const el = document.createElement("div");
        el.className = "item commitment-item";

        const tags = [
            `<span class="tag category-tag">${cat.icon} ${cat.label}</span>`,
            `<span class="tag status-tag status-${status}">${status === "paid" ? "Paid" : status === "partial" ? "Partial" : "Unpaid"}</span>`
        ];
        if (c.dueDate) {
            tags.push(`<span class="tag due-tag${overdue ? " overdue" : ""}">${overdue ? "⚠️ Overdue " : "📅 Due "}${formatDate(c.dueDate)}</span>`);
        }
        if (c.notes) {
            tags.push(`<span class="tag notes-tag" title="${escapeHtml(c.notes)}">📝</span>`);
        }
        if (c.carriedNote) {
            tags.push(`<span class="tag carried-tag">↩ ${escapeHtml(c.carriedNote)}</span>`);
        }

        el.innerHTML = `
            <div class="item-main">
                <div class="item-top">
                    <span>${c.icon || "💳"} ${escapeHtml(c.name)}</span>
                    <strong>${formatMoney(c.amount)}</strong>
                </div>
                <div class="item-meta">${tags.join("")}</div>
                ${status !== "paid" ? `<div class="item-progress">Paid ${formatMoney(c.paidAmount || 0)} of ${formatMoney(c.amount)}</div>` : ""}
            </div>
            <div class="item-actions">
                ${status !== "paid" ? `<button class="pay-btn" title="Add a payment">💵</button>` : ""}
                ${status !== "paid" ? `<button class="mark-paid-btn" title="Mark fully paid">✓</button>` : ""}
                <button class="delete-btn" aria-label="Delete ${escapeHtml(c.name)}">✕</button>
            </div>
        `;

        el.querySelector(".item-main").addEventListener("click", () => openEntryModal("commitment", c.id));
        const payBtn = el.querySelector(".pay-btn");
        if (payBtn) {
            payBtn.addEventListener("click", e => {
                e.stopPropagation();
                openPaymentModal(c.id);
            });
        }
        const markPaidBtn = el.querySelector(".mark-paid-btn");
        if (markPaidBtn) {
            markPaidBtn.addEventListener("click", e => {
                e.stopPropagation();
                markCommitmentPaid(c.id);
            });
        }
        el.querySelector(".delete-btn").addEventListener("click", e => {
            e.stopPropagation();
            deleteEntry("commitment", c.id);
        });

        list.appendChild(el);
    });
}

function markCommitmentPaid(id) {
    const month = ensureMonth(activeMonthKey);
    const c = month.commitments.find(x => x.id === id);
    if (!c) return;
    const remaining = Math.max(0, c.amount - (c.paidAmount || 0));
    c.paidAmount = c.amount;
    c.updatedAt = Date.now();
    if (remaining > 0) logPayment(activeMonthKey, c, remaining);
    saveData();
    renderHome();
    renderMonthly();
}

/* ---------- pay a commitment (adds to paidAmount, doesn't replace it) ---------- */

let paymentEntryId = null;

function openPaymentModal(id) {
    paymentEntryId = id;
    const c = ensureMonth(activeMonthKey).commitments.find(x => x.id === id);
    if (!c) return;

    const remaining = Math.max(0, c.amount - (c.paidAmount || 0));
    document.getElementById("paymentModalTitle").textContent = `Pay: ${c.name}`;
    const input = document.getElementById("paymentAmount");
    input.value = remaining.toFixed(2);

    document.getElementById("paymentModal").hidden = false;
    input.focus();
    input.select();
}

function closePaymentModal() {
    document.getElementById("paymentModal").hidden = true;
    paymentEntryId = null;
}

function savePaymentFromModal() {
    const amount = parseFloat(document.getElementById("paymentAmount").value);
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid payment amount."); return; }

    const c = ensureMonth(activeMonthKey).commitments.find(x => x.id === paymentEntryId);
    if (!c) { closePaymentModal(); return; }

    // Adds to what's already been paid (so paying RM100 twice totals RM200),
    // capped at the full amount owed.
    const applied = Math.min(amount, c.amount - (c.paidAmount || 0));
    c.paidAmount = Math.min(c.amount, (c.paidAmount || 0) + amount);
    c.updatedAt = Date.now();
    if (applied > 0) logPayment(activeMonthKey, c, applied);

    saveData();
    closePaymentModal();
    renderHome();
    renderMonthly();
}

/* ---------- rendering: home / monthly / settings ---------- */

function renderHome() {
    document.getElementById("activeMonthLabel").textContent = monthLabel(activeMonthKey);

    const { totalIncome, totalCommitment, saving, availableBalance } = getMonthTotals(activeMonthKey);
    document.getElementById("incomeValue").textContent = formatMoney(totalIncome);
    document.getElementById("totalCommitmentValue").textContent = formatMoney(totalCommitment);

    const savingEl = document.getElementById("monthSavingValue");
    savingEl.textContent = formatMoney(saving);
    savingEl.classList.toggle("negative", saving < 0);
    document.getElementById("overspendBadge").hidden = saving >= 0;

    const availableEl = document.getElementById("availableBalanceValue");
    availableEl.textContent = formatMoney(availableBalance);
    availableEl.classList.toggle("negative", availableBalance < 0);

    renderCalendar();
    renderIncomeList();
    renderCommitmentList();
}

function renderMonthly() {
    const list = document.getElementById("monthList");
    list.innerHTML = "";
    const keys = Object.keys(data.months).sort().reverse();

    if (keys.length === 0) {
        list.innerHTML = `<p class="empty-state">No months yet. Tap <strong>+ New Month</strong> to start tracking.</p>`;
        return;
    }

    keys.forEach(key => {
        const { totalIncome, totalCommitment, saving } = getMonthTotals(key);
        const row = document.createElement("div");
        row.className = "item month-item" + (key === activeMonthKey ? " active-month" : "");
        row.innerHTML = `
            <div class="month-item-main">
                <strong>${monthLabel(key)}</strong>
                <span>${formatMoney(totalIncome)} income · ${formatMoney(totalCommitment)} committed</span>
            </div>
            <strong class="${saving < 0 ? "negative" : ""}">${formatMoney(saving)}</strong>
            <button type="button" class="delete-btn month-delete-btn" data-month-key="${key}" title="Delete this month">✕</button>
        `;
        row.addEventListener("click", (e) => {
            if (e.target.closest(".month-delete-btn")) return;
            activeMonthKey = key;
            renderHome();
            switchView("home");
        });
        row.querySelector(".month-delete-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            deleteMonth(key);
        });
        list.appendChild(row);
    });
}

function deleteMonth(key) {
    const confirmed = confirm(
        `Delete the record for ${monthLabel(key)}? This will permanently remove all income, commitments, accounts transactions logged in this month, and quick entries for this month. This cannot be undone.`
    );
    if (!confirmed) return;

    delete data.months[key];
    saveData();

    if (activeMonthKey === key) {
        const remaining = Object.keys(data.months).sort();
        activeMonthKey = remaining.length > 0 ? remaining[remaining.length - 1] : monthKeyFromDate(new Date());
        ensureMonth(activeMonthKey);
        saveData();
    }

    renderMonthly();
    renderHome();
    if (!document.getElementById("view-breakdown").hidden) renderBreakdown();
}

function renderSettings() {
    document.getElementById("currencyInput").value = data.settings.currency || "RM";
    renderProfileSettingsList();
    renderSalarySettings();
}

function renderSalarySettings() {
    const salary = data.settings.permanentIncome || { enabled: false, name: "Salary", icon: "💼", amount: 0, receivedDate: 1 };
    document.getElementById("salaryEnabledInput").checked = !!salary.enabled;
    document.getElementById("salaryIconInput").value = salary.icon || "💼";
    document.getElementById("salaryNameInput").value = salary.name || "Salary";
    document.getElementById("salaryAmountInput").value = salary.amount || "";
    document.getElementById("salaryDateInput").value = salary.receivedDate || 1;
    document.getElementById("salaryFields").hidden = !salary.enabled;
}

function saveSalarySettingsFromForm() {
    const enabled = document.getElementById("salaryEnabledInput").checked;
    const icon = document.getElementById("salaryIconInput").value.trim() || "💼";
    const name = document.getElementById("salaryNameInput").value.trim() || "Salary";
    const amount = parseFloat(document.getElementById("salaryAmountInput").value) || 0;
    const receivedDate = Math.min(28, Math.max(1, parseInt(document.getElementById("salaryDateInput").value, 10) || 1));

    data.settings.permanentIncome = { enabled, icon, name, amount, receivedDate };
    saveData();
    renderSalarySettings();
    alert("Salary settings saved. It will be auto-added to new months going forward.");
}

function switchView(view) {
    ["home", "wallet", "breakdown", "recurring", "monthly", "settings"].forEach(v => {
        document.getElementById("view-" + v).hidden = v !== view;
    });
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.view === view);
    });
    if (view === "wallet") renderWallet();
    if (view === "breakdown") renderBreakdown();
    if (view === "recurring") renderRecurring();
    if (view === "monthly") renderMonthly();
    if (view === "settings") renderSettings();
}

function renderProfileChip() {
    const p = getActiveProfile();
    document.getElementById("activeProfileName").textContent = p.name;
}

function renderAll() {
    renderHome();
    renderWallet();
    renderBreakdown();
    renderMonthly();
    renderSettings();
    renderProfileChip();
}

/* ---------- entry modal (shared by Income Sources and Commitments) ---------- */

function getEntryList(kind) {
    const month = ensureMonth(activeMonthKey);
    return kind === "income" ? month.incomes : month.commitments;
}

function openEntryModal(kind, id) {
    editingEntry = { kind, id: id || null };

    const iconInput = document.getElementById("entryIcon");
    const nameInput = document.getElementById("entryName");
    const amountInput = document.getElementById("entryAmount");
    const deleteBtn = document.getElementById("deleteEntryBtn");
    const title = document.getElementById("entryModalTitle");
    const defaultIcon = kind === "income" ? "💼" : "💳";
    const label = kind === "income" ? "Income Source" : "Commitment";

    document.getElementById("commitmentOnlyFields").hidden = kind !== "commitment";
    document.getElementById("incomeOnlyFields").hidden = kind !== "income";

    if (id) {
        const entryItem = getEntryList(kind).find(x => x.id === id);
        title.textContent = "Edit " + label;
        iconInput.value = entryItem.icon || "";
        nameInput.value = entryItem.name;
        amountInput.value = entryItem.amount;
        deleteBtn.hidden = false;

        if (kind === "commitment") {
            document.getElementById("entryCategory").value = entryItem.category || "others";
            document.getElementById("entryDueDate").value = entryItem.dueDate || "";
            document.getElementById("entryPaidAmount").value = entryItem.paidAmount || 0;
            document.getElementById("entryNotes").value = entryItem.notes || "";
            document.getElementById("entryRecurring").checked = entryItem.type !== "one-time";
        } else {
            document.getElementById("entryReceivedDate").value = entryItem.receivedDate || 1;
        }
    } else {
        title.textContent = "Add " + label;
        iconInput.value = "";
        iconInput.placeholder = defaultIcon;
        nameInput.value = "";
        amountInput.value = "";
        deleteBtn.hidden = true;

        if (kind === "commitment") {
            document.getElementById("entryCategory").value = "others";
            document.getElementById("entryDueDate").value = "";
            document.getElementById("entryPaidAmount").value = 0;
            document.getElementById("entryNotes").value = "";
            document.getElementById("entryRecurring").checked = true;
        } else {
            document.getElementById("entryReceivedDate").value = 1;
        }
    }

    document.getElementById("entryModal").hidden = false;
    nameInput.focus();
}

function closeEntryModal() {
    document.getElementById("entryModal").hidden = true;
    editingEntry = { kind: "commitment", id: null };
}

function saveEntryFromModal() {
    const name = document.getElementById("entryName").value.trim();
    const icon = document.getElementById("entryIcon").value.trim();
    const amount = parseFloat(document.getElementById("entryAmount").value);

    if (!name) { alert("Please enter a name."); return; }
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount."); return; }

    const { kind, id } = editingEntry;
    const list = getEntryList(kind);
    const defaultIcon = kind === "income" ? "💼" : "💳";

    let extra = {};
    if (kind === "commitment") {
        let paidAmount = parseFloat(document.getElementById("entryPaidAmount").value);
        if (isNaN(paidAmount) || paidAmount < 0) paidAmount = 0;
        if (paidAmount > amount) paidAmount = amount;

        extra = {
            category: document.getElementById("entryCategory").value,
            dueDate: document.getElementById("entryDueDate").value,
            notes: document.getElementById("entryNotes").value.trim(),
            paidAmount,
            type: document.getElementById("entryRecurring").checked ? "recurring" : "one-time"
        };
    } else {
        let receivedDate = parseInt(document.getElementById("entryReceivedDate").value, 10);
        if (isNaN(receivedDate) || receivedDate < 1) receivedDate = 1;
        if (receivedDate > 28) receivedDate = 28;
        extra = { receivedDate };
    }

    if (id) {
        const entryItem = list.find(x => x.id === id);
        entryItem.name = name;
        entryItem.icon = icon || defaultIcon;
        entryItem.amount = amount;
        Object.assign(entryItem, extra);
        entryItem.updatedAt = Date.now();
    } else {
        list.push({ id: newId(), name, icon: icon || defaultIcon, amount, carriedNote: "", updatedAt: Date.now(), ...extra });
    }

    saveData();
    closeEntryModal();
    renderHome();
    renderMonthly();
}

function deleteEntry(kind, id) {
    const label = kind === "income" ? "income source" : "commitment";
    if (!confirm(`Delete this ${label}?`)) return;

    const month = ensureMonth(activeMonthKey);
    if (kind === "income") {
        month.incomes = month.incomes.filter(x => x.id !== id);
    } else {
        month.commitments = month.commitments.filter(x => x.id !== id);
    }
    saveData();
    renderHome();
    renderMonthly();
}

/* ---------- monthly history ---------- */

function createNewMonth() {
    const keys = Object.keys(data.months).sort();
    const latestKey = keys.length ? keys[keys.length - 1] : monthKeyFromDate(new Date());
    const nextKey = shiftMonthKey(latestKey, 1);

    if (!data.months[nextKey]) {
        const prev = data.months[latestKey];
        const newIncomes = prev ? prev.incomes.map(i => ({ ...i, id: newId(), updatedAt: Date.now() })) : [];
        seedPermanentIncome(newIncomes);
        const newCommitments = [];

        if (prev) {
            prev.commitments.forEach(c => {
                const remaining = Math.max(0, c.amount - (c.paidAmount || 0));

                // Recurring commitments regenerate fresh every month at full amount.
                if (c.type !== "one-time") {
                    newCommitments.push({
                        id: newId(),
                        name: c.name,
                        icon: c.icon,
                        category: c.category,
                        amount: c.amount,
                        paidAmount: 0,
                        dueDate: shiftDueDate(c.dueDate),
                        notes: c.notes,
                        type: c.type,
                        carriedNote: "",
                        updatedAt: Date.now()
                    });
                }

                // Anything left unpaid (recurring or one-time) carries its
                // remaining balance forward as its own line, so nothing owed
                // quietly disappears.
                if (remaining > 0) {
                    newCommitments.push({
                        id: newId(),
                        name: c.name,
                        icon: c.icon,
                        category: c.category,
                        amount: remaining,
                        paidAmount: 0,
                        dueDate: "",
                        notes: c.notes,
                        type: "one-time",
                        carriedNote: `Carried from ${monthLabel(latestKey)}`,
                        updatedAt: Date.now()
                    });
                }
            });
        }

        data.months[nextKey] = { incomes: newIncomes, commitments: newCommitments, savingsTransactions: [], paymentLog: [], quickEntries: [] };
        saveData();
    }

    activeMonthKey = nextKey;
    renderHome();
    renderMonthly();
    switchView("home");
}

/* ---------- profiles UI ---------- */

function renderProfileSettingsList() {
    const list = document.getElementById("profileList");
    list.innerHTML = "";
    getProfiles().forEach(p => {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
            <span>${p.icon || "👤"} ${escapeHtml(p.name)}${p.id === getActiveProfileId() ? ' <span class="tag">Active</span>' : ""}</span>
            <button class="settings-btn" style="width:auto;padding:8px 12px;">${p.id === getActiveProfileId() ? "Edit" : "Switch"}</button>
        `;
        row.querySelector("button").addEventListener("click", () => {
            if (p.id === getActiveProfileId()) {
                openProfileEditModal(p.id);
            } else {
                switchProfile(p.id);
            }
        });
        list.appendChild(row);
    });
}

let editingProfileId = null;

function openProfileEditModal(id) {
    editingProfileId = id || null;
    const title = document.getElementById("profileEditModalTitle");
    const iconInput = document.getElementById("profileEditIcon");
    const nameInput = document.getElementById("profileEditName");
    const deleteBtn = document.getElementById("deleteProfileBtn");

    if (id) {
        const p = getProfiles().find(x => x.id === id);
        title.textContent = "Edit Profile";
        iconInput.value = p.icon || "";
        nameInput.value = p.name;
        deleteBtn.hidden = getProfiles().length <= 1;
    } else {
        title.textContent = "Add Profile";
        iconInput.value = "";
        nameInput.value = "";
        deleteBtn.hidden = true;
    }

    document.getElementById("profileEditModal").hidden = false;
    nameInput.focus();
}

function closeProfileEditModal() {
    document.getElementById("profileEditModal").hidden = true;
    editingProfileId = null;
}

function saveProfileEditFromModal() {
    const name = document.getElementById("profileEditName").value.trim();
    const icon = document.getElementById("profileEditIcon").value.trim();
    if (!name) { alert("Please enter a name."); return; }

    if (editingProfileId) {
        updateProfile(editingProfileId, name, icon);
    } else {
        const id = addProfile(name, icon);
        switchProfile(id);
    }

    closeProfileEditModal();
    renderSettings();
    renderProfileChip();
}

/* ---------- settings actions ---------- */

function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const profileSlug = getActiveProfile().name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "profile";
    a.download = `my-commitment-${profileSlug}-backup-${monthKeyFromDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Shared merge engine for two-way syncing between two phones/profiles via
// Export -> send file -> Import -> Merge. Same id on both sides -> whichever
// copy was edited more recently wins. New id, but isDuplicateFn says it's
// the same real-world thing (e.g. both of you independently added "Rent
// RM800", or both added a "CIMB" account) -> skipped, so merging back and
// forth between two phones doesn't pile up duplicates over time.
// isDuplicateFn is omitted for pure append-only logs (transactions, payment
// history) where two separately-recorded events can legitimately look
// identical and must NOT be collapsed into one.
function mergeList(existingList, incomingList, isDuplicateFn) {
    const result = existingList.map(e => ({ ...e }));
    const byId = new Map(result.map(e => [e.id, e]));

    incomingList.forEach(inc => {
        if (byId.has(inc.id)) {
            const cur = byId.get(inc.id);
            if ((inc.updatedAt || 0) > (cur.updatedAt || 0)) {
                Object.assign(cur, inc);
            }
            return;
        }

        if (isDuplicateFn && result.some(e => isDuplicateFn(e, inc))) return;

        const copy = { ...inc };
        result.push(copy);
        byId.set(copy.id, copy);
    });

    return result;
}

function sameName(a, b) {
    return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

function mergeEntryList(existingList, incomingList) {
    return mergeList(existingList, incomingList,
        (e, inc) => sameName(e, inc) && Math.abs(e.amount - inc.amount) < 0.01);
}

// Pure append-only logs: no name-based dedupe, id + updatedAt only.
function mergeById(existingList, incomingList) {
    return mergeList(existingList, incomingList, null);
}

// Accounts, goals and items are "current state" (like incomes/commitments),
// not logs — so they also get name-based dedupe, using whichever field
// besides name distinguishes two genuinely different things of the same
// name (an account's type, an item's kind). Balances/amounts are allowed to
// differ between the two copies being merged (that's expected — the
// updatedAt-wins id match above is what reconciles those), so amount is
// deliberately NOT part of the duplicate check here.
function mergeAccounts(existingList, incomingList) {
    return mergeList(existingList, incomingList, (e, inc) => sameName(e, inc) && e.type === inc.type);
}

function mergeGoals(existingList, incomingList) {
    return mergeList(existingList, incomingList, sameName);
}

function mergeItems(existingList, incomingList) {
    return mergeList(existingList, incomingList, (e, inc) => sameName(e, inc) && e.kind === inc.kind);
}

function mergeMonths(existingMonths, incomingMonths) {
    const result = {};

    Object.keys(existingMonths).forEach(k => {
        result[k] = {
            incomes: existingMonths[k].incomes.map(e => ({ ...e })),
            commitments: existingMonths[k].commitments.map(e => ({ ...e })),
            savingsTransactions: (existingMonths[k].savingsTransactions || []).map(e => ({ ...e })),
            paymentLog: (existingMonths[k].paymentLog || []).map(e => ({ ...e }))
        };
    });

    Object.keys(incomingMonths).forEach(k => {
        if (!result[k]) {
            result[k] = {
                incomes: incomingMonths[k].incomes.map(e => ({ ...e })),
                commitments: incomingMonths[k].commitments.map(e => ({ ...e })),
                savingsTransactions: (incomingMonths[k].savingsTransactions || []).map(e => ({ ...e })),
                paymentLog: (incomingMonths[k].paymentLog || []).map(e => ({ ...e }))
            };
        } else {
            result[k].incomes = mergeEntryList(result[k].incomes, incomingMonths[k].incomes);
            result[k].commitments = mergeEntryList(result[k].commitments, incomingMonths[k].commitments);
            result[k].savingsTransactions = mergeById(result[k].savingsTransactions, incomingMonths[k].savingsTransactions || []);
            result[k].paymentLog = mergeById(result[k].paymentLog, incomingMonths[k].paymentLog || []);
        }
    });

    return result;
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed || typeof parsed !== "object" || !parsed.months) {
                throw new Error("File does not look like a My Commitment backup.");
            }
            if (!parsed.settings) parsed.settings = { currency: "RM" };
            if (!Array.isArray(parsed.accounts)) parsed.accounts = [];
            if (!Array.isArray(parsed.accountTransactions)) parsed.accountTransactions = [];
            if (!Array.isArray(parsed.goals)) parsed.goals = [];
            if (!Array.isArray(parsed.items)) parsed.items = [];
            migrateData(parsed);

            const wantsMerge = confirm(
                "Merge this backup with the data already on this profile?\n\n" +
                "OK = Merge — combine both, keeping whichever edit is newer, without duplicating matching items.\n" +
                "Cancel = Replace — wipe this profile's data and use only what's in the backup."
            );

            if (wantsMerge) {
                data.months = mergeMonths(data.months, parsed.months);
                data.accounts = mergeAccounts(data.accounts, parsed.accounts);
                data.accountTransactions = mergeById(data.accountTransactions, parsed.accountTransactions);
                data.goals = mergeGoals(data.goals, parsed.goals);
                data.items = mergeItems(data.items, parsed.items);
            } else {
                data = parsed;
            }

            ensureMonth(activeMonthKey);
            saveData();
            renderAll();
            alert(wantsMerge ? "Merged successfully." : "Data replaced with the backup.");
        } catch (err) {
            alert("Could not import file: " + err.message);
        }
    };
    reader.readAsText(file);
}

function resetAllData() {
    if (!confirm("This will permanently delete all data for this profile. Continue?")) return;
    data = { settings: { currency: "RM" }, months: {}, accounts: [], accountTransactions: [], goals: [], items: [], migratedToAccounts: true };
    ensureMonth(activeMonthKey);
    saveData();
    renderAll();
}

/* ---------- init ---------- */

document.addEventListener("DOMContentLoaded", () => {
    renderAll();

    document.getElementById("addIncomeBtn").addEventListener("click", () => openEntryModal("income", null));
    document.getElementById("addCommitmentBtn").addEventListener("click", () => openEntryModal("commitment", null));

    document.getElementById("prevMonthBtn").addEventListener("click", () => {
        activeMonthKey = shiftMonthKey(activeMonthKey, -1);
        ensureMonth(activeMonthKey);
        saveData();
        renderHome();
        if (!document.getElementById("view-breakdown").hidden) renderBreakdown();
    });
    document.getElementById("nextMonthBtn").addEventListener("click", () => {
        activeMonthKey = shiftMonthKey(activeMonthKey, 1);
        ensureMonth(activeMonthKey);
        saveData();
        renderHome();
        if (!document.getElementById("view-breakdown").hidden) renderBreakdown();
    });

    document.getElementById("cancelEntryBtn").addEventListener("click", closeEntryModal);
    document.getElementById("saveEntryBtn").addEventListener("click", saveEntryFromModal);
    document.getElementById("deleteEntryBtn").addEventListener("click", () => {
        if (editingEntry.id) deleteEntry(editingEntry.kind, editingEntry.id);
        closeEntryModal();
    });

    document.getElementById("newMonthBtn").addEventListener("click", createNewMonth);

    document.getElementById("cancelPaymentBtn").addEventListener("click", closePaymentModal);
    document.getElementById("savePaymentBtn").addEventListener("click", savePaymentFromModal);

    document.getElementById("closeDayDetailBtn").addEventListener("click", closeDayDetailModal);
    document.getElementById("addDayIncomeBtn").addEventListener("click", () => openQuickEntryModal("income"));
    document.getElementById("addDayExpenseBtn").addEventListener("click", () => openQuickEntryModal("expense"));
    document.getElementById("cancelQuickEntryBtn").addEventListener("click", closeQuickEntryModal);
    document.getElementById("saveQuickEntryBtn").addEventListener("click", saveQuickEntryFromModal);

    document.getElementById("viewRecurringLinkBtn").addEventListener("click", () => switchView("recurring"));
    document.getElementById("viewRecurringFromBreakdownBtn").addEventListener("click", () => switchView("recurring"));
    document.getElementById("backFromRecurringBtn").addEventListener("click", () => switchView("home"));

    // Wallet sub-tabs
    document.querySelectorAll("#walletTabs .segmented-btn").forEach(btn => {
        btn.addEventListener("click", () => switchWalletTab(btn.dataset.walletTab));
    });

    // Breakdown Expenses/Income tabs
    document.querySelectorAll("#breakdownTabs .segmented-btn").forEach(btn => {
        btn.addEventListener("click", () => switchBreakdownTab(btn.dataset.breakdownTab));
    });

    // Accounts
    document.getElementById("addAccountBtn").addEventListener("click", () => openAccountModal(null));
    document.getElementById("cancelAccountBtn").addEventListener("click", closeAccountModal);
    document.getElementById("saveAccountBtn").addEventListener("click", saveAccountFromModal);
    document.getElementById("deleteAccountBtn").addEventListener("click", () => {
        if (editingAccountId) { deleteAccount(editingAccountId); closeAccountModal(); }
    });
    document.getElementById("cancelAccountTxBtn").addEventListener("click", closeAccountTxModal);
    document.getElementById("saveAccountTxBtn").addEventListener("click", saveAccountTxFromModal);

    // Goals
    document.getElementById("addGoalBtn").addEventListener("click", () => openGoalModal(null));
    document.getElementById("cancelGoalBtn").addEventListener("click", closeGoalModal);
    document.getElementById("saveGoalBtn").addEventListener("click", saveGoalFromModal);
    document.getElementById("deleteGoalBtn").addEventListener("click", () => {
        if (editingGoalId) { deleteGoal(editingGoalId); closeGoalModal(); }
    });
    document.getElementById("cancelGoalTxBtn").addEventListener("click", closeGoalTxModal);
    document.getElementById("saveGoalTxBtn").addEventListener("click", saveGoalTxFromModal);

    // Items
    document.getElementById("addItemBtn").addEventListener("click", () => openItemModal(null));
    document.getElementById("cancelItemBtn").addEventListener("click", closeItemModal);
    document.getElementById("saveItemBtn").addEventListener("click", saveItemFromModal);
    document.getElementById("itemKind").addEventListener("change", updateItemAmountLabel);
    document.getElementById("deleteItemBtn").addEventListener("click", () => {
        if (editingItemId) { deleteItem(editingItemId); closeItemModal(); }
    });

    // Profiles
    document.getElementById("profileSwitchBtn").addEventListener("click", openProfileSwitchModal);
    document.getElementById("closeProfileSwitchBtn").addEventListener("click", closeProfileSwitchModal);
    document.getElementById("addProfileBtn").addEventListener("click", () => openProfileEditModal(null));
    document.getElementById("cancelProfileEditBtn").addEventListener("click", closeProfileEditModal);
    document.getElementById("saveProfileEditBtn").addEventListener("click", saveProfileEditFromModal);
    document.getElementById("deleteProfileBtn").addEventListener("click", () => {
        if (editingProfileId && deleteProfile(editingProfileId)) {
            closeProfileEditModal();
            data = loadData();
            renderAll();
        }
    });

    document.getElementById("currencyInput").addEventListener("change", e => {
        data.settings.currency = e.target.value.trim() || "RM";
        saveData();
        renderHome();
        renderMonthly();
    });

    document.getElementById("salaryEnabledInput").addEventListener("change", e => {
        document.getElementById("salaryFields").hidden = !e.target.checked;
    });
    document.getElementById("saveSalaryBtn").addEventListener("click", saveSalarySettingsFromForm);

    document.getElementById("exportBtn").addEventListener("click", exportData);
    document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
    document.getElementById("importFile").addEventListener("change", e => {
        if (e.target.files[0]) importData(e.target.files[0]);
        e.target.value = "";
    });
    document.getElementById("resetBtn").addEventListener("click", resetAllData);

    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.addEventListener("click", () => switchView(btn.dataset.view));
    });

    document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
        backdrop.addEventListener("click", e => {
            if (e.target === backdrop) backdrop.hidden = true;
        });
    });
});

function openProfileSwitchModal() {
    const list = document.getElementById("profileSwitchList");
    list.innerHTML = "";
    getProfiles().forEach(p => {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
            <span>${p.icon || "👤"} ${escapeHtml(p.name)}${p.id === getActiveProfileId() ? ' <span class="tag">Active</span>' : ""}</span>
        `;
        row.addEventListener("click", () => {
            switchProfile(p.id);
            closeProfileSwitchModal();
        });
        list.appendChild(row);
    });
    document.getElementById("profileModal").hidden = false;
}

function closeProfileSwitchModal() {
    document.getElementById("profileModal").hidden = true;
}
