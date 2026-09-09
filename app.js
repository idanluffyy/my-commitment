let totalCommitment = 1585;

function addCommitment() {
    const name = prompt("Commitment name:");

    if (!name) {
        return;
    }

    const amountInput = prompt("Amount (RM):");
    const amount = parseFloat(amountInput);

    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    const list = document.getElementById("commitmentList");

    const item = document.createElement("div");
    item.className = "item";

    item.innerHTML = `
        <span>💳 ${name}</span>
        <strong>RM ${amount.toFixed(2)}</strong>
    `;

    list.appendChild(item);

    totalCommitment += amount;

    updateTotal();
}

function updateTotal() {
    const cards = document.querySelectorAll(".card strong");

    // Total Commitment = card kedua
    cards[1].textContent =
        `RM ${totalCommitment.toFixed(2)}`;
}