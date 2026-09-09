/* My Commitment — data-driven budgeting PWA
   All data lives in localStorage under STORAGE_KEY, keyed by month ("YYYY-MM").
   No personal data is baked in: every install starts blank. */

const STORAGE_KEY = "myCommitmentData";

let data = loadData();
let activeMonthKey = monthKeyFromDate(new Date());
let editingCommitmentId = null; // null while adding, a commitment id while editing

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
                return parsed;
            }
        }
    } catch (e) {
        console.warn("Could not read saved data, starting fresh.", e);
    }
    return { settings: { currency: "RM" }, months: {} };
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function ensureMonth(key) {
    if (!data.months[key]) {
        data.months[key] = { income: 0, commitments: [] };
    }
    return data.months[key];
}

/* ---------- month key helpers ---------- */

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

/* ---------- calculations ---------- */

function formatMoney(amount) {
    const currency = data.settings.currency || "RM";
    const sign = amount < 0 ? "-" : "";
    return `${sign}${currency} ${Math.abs(amount).toFixed(2)}`;
}

function getMonthTotals(key) {
    const month = data.months[key] || { income: 0, commitments: [] };
    const totalCommitment = month.commitments.reduce((sum, c) => sum + c.amount, 0);
    return { income: month.income, totalCommitment, saving: month.income - totalCommitment };
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

/* ---------- rendering ---------- */

function renderHome() {
    document.getElementById("activeMonthLabel").textContent = monthLabel(activeMonthKey);

    const { income, totalCommitment, saving } = getMonthTotals(activeMonthKey);
    document.getElementById("incomeValue").textContent = formatMoney(income);
    document.getElementById("totalCommitmentValue").textContent = formatMoney(totalCommitment);

    const savingEl = document.getElementById("monthSavingValue");
    savingEl.textContent = formatMoney(saving);
    savingEl.classList.toggle("negative", saving < 0);

    const balance = getCumulativeSavingUpTo(activeMonthKey);
    const balanceEl = document.getElementById("savingBalanceValue");
    balanceEl.textContent = formatMoney(balance);
    balanceEl.classList.toggle("negative", balance < 0);

    const month = ensureMonth(activeMonthKey);
    const list = document.getElementById("commitmentList");
    list.innerHTML = "";
    document.getElementById("emptyState").hidden = month.commitments.length > 0;

    month.commitments.forEach(c => {
        const item = document.createElement("div");
        item.className = "item";
        item.innerHTML = `
            <span>${c.icon || "💳"} ${escapeHtml(c.name)}</span>
            <strong>${formatMoney(c.amount)}</strong>
            <button class="delete-btn" aria-label="Delete ${escapeHtml(c.name)}">✕</button>
        `;
        item.querySelector("span").addEventListener("click", () => openCommitmentModal(c.id));
        item.querySelector("strong").addEventListener("click", () => openCommitmentModal(c.id));
        item.querySelector(".delete-btn").addEventListener("click", e => {
            e.stopPropagation();
            deleteCommitment(c.id);
        });
        list.appendChild(item);
    });
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
        const { income, totalCommitment, saving } = getMonthTotals(key);
        const row = document.createElement("div");
        row.className = "item month-item" + (key === activeMonthKey ? " active-month" : "");
        row.innerHTML = `
            <div class="month-item-main">
                <strong>${monthLabel(key)}</strong>
                <span>${formatMoney(income)} income · ${formatMoney(totalCommitment)} committed</span>
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

/* ---------- commitment modal ---------- */

function openCommitmentModal(id) {
    editingCommitmentId = id || null;
    const iconInput = document.getElementById("commitmentIcon");
    const nameInput = document.getElementById("commitmentName");
    const amountInput = document.getElementById("commitmentAmount");
    const deleteBtn = document.getElementById("deleteCommitmentBtn");

    if (id) {
        const c = ensureMonth(activeMonthKey).commitments.find(x => x.id === id);
        document.getElementById("modalTitle").textContent = "Edit Commitment";
        iconInput.value = c.icon || "";
        nameInput.value = c.name;
        amountInput.value = c.amount;
        deleteBtn.hidden = false;
    } else {
        document.getElementById("modalTitle").textContent = "Add Commitment";
        iconInput.value = "";
        nameInput.value = "";
        amountInput.value = "";
        deleteBtn.hidden = true;
    }

    document.getElementById("commitmentModal").hidden = false;
    nameInput.focus();
}

function closeCommitmentModal() {
    document.getElementById("commitmentModal").hidden = true;
    editingCommitmentId = null;
}

function saveCommitmentFromModal() {
    const name = document.getElementById("commitmentName").value.trim();
    const icon = document.getElementById("commitmentIcon").value.trim();
    const amount = parseFloat(document.getElementById("commitmentAmount").value);

    if (!name) { alert("Please enter a name."); return; }
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount."); return; }

    const month = ensureMonth(activeMonthKey);

    if (editingCommitmentId) {
        const c = month.commitments.find(x => x.id === editingCommitmentId);
        c.name = name;
        c.icon = icon || "💳";
        c.amount = amount;
    } else {
        month.commitments.push({
            id: "c" + Date.now() + Math.random().toString(36).slice(2, 7),
            name,
            icon: icon || "💳",
            amount
        });
    }

    saveData();
    closeCommitmentModal();
    renderHome();
    renderMonthly();
    renderSavings();
}

function deleteCommitment(id) {
    if (!confirm("Delete this commitment?")) return;
    const month = ensureMonth(activeMonthKey);
    month.commitments = month.commitments.filter(c => c.id !== id);
    saveData();
    renderHome();
    renderMonthly();
    renderSavings();
}

/* ---------- income modal ---------- */

function openIncomeModal() {
    document.getElementById("incomeInput").value = ensureMonth(activeMonthKey).income || "";
    document.getElementById("incomeModal").hidden = false;
    document.getElementById("incomeInput").focus();
}

function closeIncomeModal() {
    document.getElementById("incomeModal").hidden = true;
}

function saveIncomeFromModal() {
    const val = parseFloat(document.getElementById("incomeInput").value);
    if (isNaN(val) || val < 0) { alert("Please enter a valid income amount."); return; }
    ensureMonth(activeMonthKey).income = val;
    saveData();
    closeIncomeModal();
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
        data.months[nextKey] = {
            income: prev ? prev.income : 0,
            commitments: prev
                ? prev.commitments.map(c => ({ ...c, id: "c" + Date.now() + Math.random().toString(36).slice(2, 7) }))
                : []
        };
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

    document.getElementById("addCommitmentBtn").addEventListener("click", () => openCommitmentModal(null));

    document.getElementById("incomeCard").addEventListener("click", openIncomeModal);
    document.getElementById("incomeCard").addEventListener("keypress", e => {
        if (e.key === "Enter") openIncomeModal();
    });

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

    document.getElementById("cancelCommitmentBtn").addEventListener("click", closeCommitmentModal);
    document.getElementById("saveCommitmentBtn").addEventListener("click", saveCommitmentFromModal);
    document.getElementById("deleteCommitmentBtn").addEventListener("click", () => {
        if (editingCommitmentId) deleteCommitment(editingCommitmentId);
        closeCommitmentModal();
    });

    document.getElementById("cancelIncomeBtn").addEventListener("click", closeIncomeModal);
    document.getElementById("saveIncomeBtn").addEventListener("click", saveIncomeFromModal);

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
