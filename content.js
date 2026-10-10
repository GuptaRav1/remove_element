// ==========================================
// 1. UI CLEANER FUNCTIONALITY
// ==========================================
const targetSelectors = [
    'header.bx-navigation',
    'div.scroll-wrapper',
    'div.trade-footer-banner',
    'div.account-info-wrapper',
    'div.estimate-info',
    'div.max-slippage',
    'div.vip-level-wrap.align-center',
    'div.info-line',
    'div.order-panel-tabs',
    'div.account-header',
    'ul#swap-trade-tabs',
    'div.ice-slider'
].join(', ');

function removeElements() {
    const elements = document.querySelectorAll(targetSelectors);
    elements.forEach(el => el.remove());
}

removeElements();

const observer = new MutationObserver(() => {
    removeElements();
});

if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

setTimeout(() => {
    observer.disconnect();
}, 10000);


// ==========================================
// 2. AUTOMATIC CLIPBOARD POLLING FUNCTIONALITY
// ==========================================
let lastClipboardText = "";

async function pollClipboardForStopPrice() {
    // The browser requires the document to be focused to read the clipboard without permission errors
    if (!document.hasFocus()) return;

    try {
        const clipboardText = await navigator.clipboard.readText();

        // Proceed only if the clipboard contains new content
        if (clipboardText && clipboardText !== lastClipboardText) {
            const cleanedNumber = clipboardText.replace(/,/g, '').trim();

            // Validate if the new clipboard text is a usable number
            if (!isNaN(cleanedNumber) && cleanedNumber !== '') {
                lastClipboardText = clipboardText; // Update cache to prevent continuous firing

                // Locate the Stop Loss input (assuming it is the second .sltp-wrapper)
                const sltpWrappers = document.querySelectorAll('.sltp-wrapper');
                if (sltpWrappers.length >= 2) {
                    const slWrap = sltpWrappers[1];
                    const slInput = slWrap.querySelector('input.tl-input-inner');

                    if (slInput && slInput.value !== cleanedNumber) {
                        slInput.value = cleanedNumber;
                        slInput.dispatchEvent(new Event('input', { bubbles: true }));
                        slInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }
        }
    } catch (error) {
        // Silently catch errors caused by temporary loss of focus
    }
}

// Poll the clipboard every 500ms
setInterval(pollClipboardForStopPrice, 500);

// Instantly check the clipboard the moment the user switches back to the BingX tab
window.addEventListener('focus', pollClipboardForStopPrice);


// ==========================================
// 3. INJECT RISK MANAGEMENT UI 
// ==========================================
function injectRiskUI() {
    // Prevent duplicate injections
    if (document.getElementById('custom-risk-ui')) return;

    // Target the main order panel wrapper from the BingX HTML
    const orderPanel = document.querySelector('.order-panel-body');
    if (!orderPanel) return; // Exit and try again next interval if the UI hasn't loaded yet

    const uiContainer = document.createElement('div');
    uiContainer.id = 'custom-risk-ui';

    // CSS adjusted to match the dark theme and fit nicely at the bottom
    uiContainer.style.cssText = `
        background: #14151a;
        border: 1px solid #2b2f36;
        padding: 12px;
        margin: 10px 16px 20px 16px; /* Added extra bottom margin for breathing room */
        border-radius: 8px;
        color: #EAECEF;
        font-family: Arial, sans-serif;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;

    const savedX = localStorage.getItem('bingx_initial_balance') || '10';

    uiContainer.innerHTML = `
        <div style="display: flex; gap: 10px; align-items: center;">
            <input type="number" id="initial-balance-input" value="${savedX}" 
                style="width: 80%; padding: 6px; background: #222222; border: 1px solid #2b2f36; color: #EAECEF; border-radius: 4px; outline: none;">
            <button id="save-balance-btn" 
                style="width: max-content; padding: 6px 12px; background: #3f36f5; color: #d1d1d1; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                Save
            </button>
        </div>
        <div id="risk-status" style="font-size: 12px; color: #848E9C;">Loading stats...</div>
    `;

    // appendChild adds the element at the very end of the selected container
    orderPanel.appendChild(uiContainer);

    document.getElementById('save-balance-btn').addEventListener('click', () => {
        const newVal = document.getElementById('initial-balance-input').value;
        if (!isNaN(newVal) && newVal > 0) {
            localStorage.setItem('bingx_initial_balance', newVal);
            document.getElementById('save-balance-btn').innerText = 'Saved!';
            setTimeout(() => document.getElementById('save-balance-btn').innerText = 'Save', 1500);
        }
    });
}

// Check for the order panel every second to ensure the UI injects when switching tabs or refreshing
setInterval(injectRiskUI, 1000);


// ==========================================
// 4. DYNAMIC POSITION SIZING CALCULATOR
// ==========================================
function getDynamicRiskUSD() {
    // Read Initial Balance X
    const storedX = parseFloat(localStorage.getItem('bingx_initial_balance') || '100');

    // Scrape Current Balance from BingX UI
    const balanceElement = document.querySelector('.op-asset-content .text-tip');
    if (!balanceElement) return null; // Wait until UI loads

    const currentBalance = parseFloat(balanceElement.innerText.replace(/,/g, ''));
    if (isNaN(currentBalance)) return null;

    // Calculate Gain vs X
    const gainPercentage = ((currentBalance - storedX) / storedX) * 100;

    // Determine Risk Percentage Slab
    // Math.floor(gain / 10) + 1 brackets gains by 10s continuously
    // Math.max(1, ...) sets the absolute floor at 1% for drawdowns (< 0% gain)
    const riskPercentage = Math.max(1, Math.floor(gainPercentage / 10) + 1);

    // Calculate final risk dollar amount (calculated against static X)
    const riskUSD = storedX * (riskPercentage / 100);

    // Update the injected UI widget with live stats
    const statusDiv = document.getElementById('risk-status');
    if (statusDiv) {
        statusDiv.innerHTML = `
            Balance: $${currentBalance.toFixed(2)}<br>
            Gain: ${gainPercentage.toFixed(2)}%<br>
            Risk Tier: ${riskPercentage}% ($${riskUSD.toFixed(2)})
        `;
    }

    return riskUSD;
}

function calculateDynamicAmount() {
    // 1. Locate the Amount Input
    const amountWrap = document.querySelector('.amount-input-wrap');
    if (!amountWrap) return;
    const amountInput = amountWrap.querySelector('input.tl-input-inner');
    if (!amountInput) return;

    if (document.activeElement === amountInput) return;

    // 2. Retrieve dynamic risk amount
    const dynamicRiskUSD = getDynamicRiskUSD();
    if (dynamicRiskUSD === null) return;

    // 3. Retrieve the Stop Loss Price securely
    const sltpWrappers = document.querySelectorAll('.sltp-wrapper');
    if (sltpWrappers.length < 2) return;

    const slWrap = sltpWrappers[1];
    const slInputs = slWrap.querySelectorAll('input.tl-input-inner');

    let slPrice = NaN;
    for (const input of slInputs) {
        if (input.value) {
            slPrice = parseFloat(input.value.replace(/,/g, ''));
            if (!isNaN(slPrice)) break;
        }
    }

    if (isNaN(slPrice)) return;

    // 4. Retrieve the Current Market Price from the document title
    const titleMatch = document.title.match(/\$?([\d,]+(?:\.\d+)?)/);
    if (!titleMatch) return;
    const currentPrice = parseFloat(titleMatch[1].replace(/,/g, ''));

    // 5. Validate numbers to prevent NaN errors or division by zero
    if (isNaN(currentPrice) || slPrice === currentPrice) return;

    // 6. Calculate the required amount (Amount = Dynamic Risk / Price Difference)
    const priceDifference = Math.abs(currentPrice - slPrice);
    const rawAmount = dynamicRiskUSD / priceDifference;

    // 7. Format the amount to appropriate decimal places
    let finalAmount = rawAmount.toFixed(4);
    finalAmount = parseFloat(finalAmount).toString();

    // 8. Inject the calculated amount into the UI if it has changed
    if (amountInput.value !== finalAmount) {
        amountInput.value = finalAmount;
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 9. Also fill the secondary trade input (.trade-input.dynamic-txt.number)
    const tradeInput = document.querySelector('input.trade-input.dynamic-txt.number');
    if (tradeInput && tradeInput.value !== finalAmount) {
        tradeInput.value = finalAmount;
        tradeInput.dispatchEvent(new Event('input', { bubbles: true }));
        tradeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// Run the calculator every 500 milliseconds 
setInterval(calculateDynamicAmount, 500);