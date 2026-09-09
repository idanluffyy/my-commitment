/* My Commitment — data-driven budgeting PWA
   All data lives in localStorage under STORAGE_KEY, keyed by month ("YYYY-MM").
   No personal data is baked in: every install starts blank. */

const STORAGE_KEY = "myCommitmentData";

const CATEGORIES = [
    { id: "housing", label: "Housing", icon: "🏠" },
    { id: "transport", label: "Transport", icon: "🚗" },
    { id: "food", label: "Food", icon: "🍔" },
    { id: "bills", label: "Bills", icon: "💡" },
    { id: "others", label: "Others", icon: "📦" }
];

let data = loadData();
let activeMonthKey = monthKeyFromDate(new Date());

// While the entry modal is open: which list it edits and which item (null = adding new)
let editingEntry = { kind: "commitment", id: null };

ensureMonth(activeMonthKey);

/* ---------- persistence ---------- */

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                if (!parsed.settings) parsed.settings = { currency: "RM" };
                if (!parsed.months) parsed.months = {};
                migrateData(parsed);
                return parsed;
            }
        }
    } catch (e) {
        console.warn("Could not read saved data, starting fresh.", e);
    }
    return { settings: { currency: "RM" }, months: {} };
}

// Keeps older backups working as the data model grows. Never drops a record —
// only fills in fields that didn't exist yet, with safe defaults.
function migrateData(parsed) {
    Object.values(parsed.months).forEach(month => {
        if (!Array.isArray(month.incomes)) {
            const legacyIncome = typeof month.income === "number" ? month.income : 0;
            month.incomes = legacyIncome > 0
                ? [{ id: newId(), icon: "💼", name: "Income", amount: legacyIncome }]
                : [];
            delete month.income;
        }
        if (!Array.isArray(month.commitments)) {
            month.commitments = [];
        }
        month.commitments.forEach(c => {
            if (c.category === undefined) c.category = "others";
            if (c.type === undefined) c.type = "recurring";
            // Commitments created before payment tracking existed are assumed
            // already settled, so they don't suddenly show up as "unpaid".
            if (c.paidAmount === undefined) c.paidAmount = c.amount;
            if (c.dueDate === undefined) c.dueDate = "";
            if (c.notes === undefined) c.notes = "";
            if (c.carriedNote === undefined) c.carriedNote = "";
        });
    });
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function ensureMonth(key) {
    if (!data.months[key]) {
        data.months[key] = { incomes: [], commitments: [] };
    }
    return data.months[key];
}

function newId() {
    return "id" + Date.now() + Math.random().toString(36).slice(2, 7);
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
    return totals;
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

/* ---------- calculations ---------- */

function formatMoney(amount) {
    const currency = data.settings.currency || "RM";
    const sign = amount < 0 ? "-" : "";
    return `${sign}${currency} ${Math.abs(amount).toFixed(2)}`;
}

function getMonthTotals(key) {
    const month = data.months[key] || { incomes: [], commitments: [] };
    const totalIncome = month.incomes.reduce((sum, i) => sum + i.amount, 0);
    const totalCommitment = month.commitments.reduce((sum, c) => sum + c.amount, 0);
    const totalPaid = month.commitments.reduce((sum, c) => sum + (c.paidAmount || 0), 0);
    return {
        totalIncome,
        totalCommitment,
        totalPaid,
        saving: totalIncome - totalCommitment,
        availableBalance: totalIncome - totalPaid
    };
}

function getCumulativeSavingUpTo(key) {
    return Object.keys(data.months)
        .filter(k => k <= key)
        .sort()
        .reduce((sum, k) => sum + getMonthTotals(k).saving, 0);
}

function getTotalSavingsBalance() {
    return Object.keys(data.months).reduce((sum, k) => sum + getMonthTotals(k).saving, 0);
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
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
                ${status !== "paid" ? `<button class="mark-paid-btn" title="Mark fully paid">✓</button>` : ""}
                <button class="delete-btn" aria-label="Delete ${escapeHtml(c.name)}">✕</button>
            </div>
        `;

        el.querySelector(".item-main").addEventListener("click", () => openEntryModal("commitment", c.id));
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

    renderCategoryBreakdown();
}

function renderCategoryBreakdown() {
    const box = document.getElementById("categoryBreakdown");
    const totals = getCategoryTotals(activeMonthKey);
    const entries = CATEGORIES.map(cat => ({ ...cat, total: totals[cat.id] })).filter(c => c.total > 0);

    if (entries.length === 0) {
        box.hidden = true;
        box.innerHTML = "";
        return;
    }

    box.hidden = false;
    box.innerHTML = `<h3 class="breakdown-title">By Category</h3>` +
        entries.map(c => `
            <div class="breakdown-row">
                <span>${c.icon} ${c.label}</span>
                <strong>${formatMoney(c.total)}</strong>
            </div>
        `).join("");
}

function markCommitmentPaid(id) {
    const month = ensureMonth(activeMonthKey);
    const c = month.commitments.find(x => x.id === id);
    if (!c) return;
    c.paidAmount = c.amount;
    saveData();
    renderHome();
    renderMonthly();
    renderSavings();
}

/* ---------- rendering: home / monthly / savings / settings ---------- */

function renderHome() {
    document.getElementById("activeMonthLabel").textContent = monthLabel(activeMonthKey);

    const { totalIncome, totalCommitment, saving, availableBalance } = getMonthTotals(activeMonthKey);
    document.getElementById("incomeValue").textContent = formatMoney(totalIncome);
    document.getElementById("totalCommitmentValue").textContent = formatMoney(totalCommitment);

    const savingEl = document.getElementById("monthSavingValue");
    savingEl.textContent = formatMoney(saving);
    savingEl.classList.toggle("negative", saving < 0);
    document.getElementById("overspendBadge").hidden = saving >= 0;

    const balance = getCumulativeSavingUpTo(activeMonthKey);
    const balanceEl = document.getElementById("savingBalanceValue");
    balanceEl.textContent = formatMoney(balance);
    balanceEl.classList.toggle("negative", balance < 0);

    const availableEl = document.getElementById("availableBalanceValue");
    availableEl.textContent = formatMoney(availableBalance);
    availableEl.classList.toggle("negative", availableBalance < 0);

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
        `;
        row.addEventListener("click", () => {
            activeMonthKey = key;
            renderHome();
            switchView("home");
        });
        list.appendChild(row);
    });
}

function renderSavings() {
    document.getElementById("savingsTotalValue").textContent = formatMoney(getTotalSavingsBalance());

    const log = document.getElementById("savingsLog");
    log.innerHTML = "";
    const keys = Object.keys(data.months).sort().reverse();

    if (keys.length === 0) {
        log.innerHTML = `<p class="empty-state">No data yet.</p>`;
        return;
    }

    keys.forEach(key => {
        const { saving } = getMonthTotals(key);
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
            <span>${monthLabel(key)}</span>
            <strong class="${saving < 0 ? "negative" : "positive"}">${saving >= 0 ? "+" : ""}${formatMoney(saving)}</strong>
        `;
        log.appendChild(row);
    });
}

function renderSettings() {
    document.getElementById("currencyInput").value = data.settings.currency || "RM";
}

function switchView(view) {
    ["home", "monthly", "savings", "settings"].forEach(v => {
        document.getElementById("view-" + v).hidden = v !== view;
    });
    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.view === view);
    });
    if (view === "monthly") renderMonthly();
    if (view === "savings") renderSavings();
    if (view === "settings") renderSettings();
}

function renderAll() {
    renderHome();
    renderMonthly();
    renderSavings();
    renderSettings();
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
    }

    if (id) {
        const entryItem = list.find(x => x.id === id);
        entryItem.name = name;
        entryItem.icon = icon || defaultIcon;
        entryItem.amount = amount;
        Object.assign(entryItem, extra);
    } else {
        list.push({ id: newId(), name, icon: icon || defaultIcon, amount, carriedNote: "", ...extra });
    }

    saveData();
    closeEntryModal();
    renderHome();
    renderMonthly();
    renderSavings();
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
    renderSavings();
}

/* ---------- monthly history ---------- */

function createNewMonth() {
    const keys = Object.keys(data.months).sort();
    const latestKey = keys.length ? keys[keys.length - 1] : monthKeyFromDate(new Date());
    const nextKey = shiftMonthKey(latestKey, 1);

    if (!data.months[nextKey]) {
        const prev = data.months[latestKey];
        const newIncomes = prev ? prev.incomes.map(i => ({ ...i, id: newId() })) : [];
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
                        carriedNote: ""
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
                        carriedNote: `Carried from ${monthLabel(latestKey)}`
                    });
                }
            });
        }

        data.months[nextKey] = { incomes: newIncomes, commitments: newCommitments };
        saveData();
    }

    activeMonthKey = nextKey;
    renderHome();
    renderMonthly();
    switchView("home");
}

/* ---------- settings actions ---------- */

function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-commitment-backup-${monthKeyFromDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
            migrateData(parsed);
            data = parsed;
            ensureMonth(activeMonthKey);
            saveData();
            renderAll();
            alert("Data imported successfully.");
        } catch (err) {
            alert("Could not import file: " + err.message);
        }
    };
    reader.readAsText(file);
}

function resetAllData() {
    if (!confirm("This will permanently delete all your data. Continue?")) return;
    data = { settings: { currency: "RM" }, months: {} };
    ensureMonth(activeMonthKey);
    saveData();
    renderAll();
}

/* ---------- init ---------- */

document.addEventListener("DOMContentLoaded", () => {
    renderHome();

    document.getElementById("addIncomeBtn").addEventListener("click", () => openEntryModal("income", null));
    document.getElementById("addCommitmentBtn").addEventListener("click", () => openEntryModal("commitment", null));

    document.getElementById("prevMonthBtn").addEventListener("click", () => {
        activeMonthKey = shiftMonthKey(activeMonthKey, -1);
        ensureMonth(activeMonthKey);
        saveData();
        renderHome();
    });
    document.getElementById("nextMonthBtn").addEventListener("click", () => {
        activeMonthKey = shiftMonthKey(activeMonthKey, 1);
        ensureMonth(activeMonthKey);
        saveData();
        renderHome();
    });

    document.getElementById("cancelEntryBtn").addEventListener("click", closeEntryModal);
    document.getElementById("saveEntryBtn").addEventListener("click", saveEntryFromModal);
    document.getElementById("deleteEntryBtn").addEventListener("click", () => {
        if (editingEntry.id) deleteEntry(editingEntry.kind, editingEntry.id);
        closeEntryModal();
    });

    document.getElementById("newMonthBtn").addEventListener("click", createNewMonth);

    document.getElementById("currencyInput").addEventListener("change", e => {
        data.settings.currency = e.target.value.trim() || "RM";
        saveData();
        renderHome();
        renderMonthly();
        renderSavings();
    });

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
