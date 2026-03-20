import { Board } from "./engine.js";

const board = new Board();

let state = board.getBoardState();
let selected = null;
let splitMode = false;

const boardEl = document.getElementById("chessboard");
const turnLabel = document.getElementById("turn-label");
const statusDot = document.getElementById("status-dot");
const statusMsg = document.getElementById("status-message");
const capturedWhite = document.getElementById("captured-white");
const capturedBlack = document.getElementById("captured-black");
const historyEl = document.getElementById("move-history");
const overlayEl = document.getElementById("game-over-overlay");
const gameOverTitle = document.getElementById("game-over-title");
const gameOverSub = document.getElementById("game-over-subtitle");
const gameOverIcon = document.getElementById("game-over-icon");
const resetBtn = document.getElementById("reset-btn");
const gameOverReset = document.getElementById("game-over-reset");
const quantumPanel = document.getElementById("quantum-panel");
const splitBtn = document.getElementById("split-btn");
const quantumHint = document.getElementById("quantum-hint");
const coinOverlay = document.getElementById("coin-flip-overlay");
const coinEl = document.getElementById("coin");
const coinDesc = document.getElementById("coin-flip-desc");
const coinResultText = document.getElementById("coin-result-text");
const coinFlipBtn = document.getElementById("coin-flip-btn");
const CAPTURE_SYMBOLS = {
    K: "♔",
    Q: "♕",
    R: "♖",
    B: "♗",
    N: "♘",
    P: "♙",
    k: "♚",
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
    p: "♟",
};

function setBoardSize() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let size;

    if (viewportWidth <= 600) {
        size = Math.min(viewportWidth - 48, viewportHeight - 200);
    } else {
        size = Math.min(560, viewportHeight - 200, viewportWidth - 560);
    }

    size = Math.max(320, Math.floor(size / 8) * 8);
    document.documentElement.style.setProperty("--board-size", `${size}px`);
}

function refreshState() {
    state = board.getBoardState();
}

function render() {
    refreshState();
    renderBoard();
    renderStatus();
    renderHistory();
    renderSuccessfulCapturedPanel();
    renderQuantumPanel();

    if (state.winner || state.is_checkmate || state.is_stalemate) {
        showGameOver();
    }
}

function renderBoard() {
    boardEl.innerHTML = "";

    for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
            const cell = state.board[row][col];
            const square = cell.square;
            const isLight = (row + col) % 2 === 0;
            const squareEl = document.createElement("button");
            squareEl.type = "button";
            squareEl.className = `square ${isLight ? "light" : "dark"}`;
            squareEl.dataset.square = square;
            squareEl.setAttribute("aria-label", square);

            if (selected === square) {
                squareEl.classList.add("selected");
            }

            if (state.in_check && cell.piece && cell.piece.toUpperCase() === "K" && cell.color === state.turn) {
                squareEl.classList.add("in-check");
            }

            if (cell.piece) {
                const pieceEl = document.createElement("span");
                pieceEl.className = `piece ${cell.color === "white" ? "white-piece" : "black-piece"}${cell.is_quantum ? " quantum" : ""}`;
                pieceEl.textContent = cell.symbol;
                squareEl.appendChild(pieceEl);
            }

            if (!splitMode && selected && state.legal_moves[selected]) {
                const legalMove = state.legal_moves[selected].find((move) => move.target === square);
                if (legalMove) {
                    const dot = document.createElement("span");
                    dot.className = `legal-dot${cell.piece ? " capture" : ""}`;
                    squareEl.appendChild(dot);
                }
            }

            if (splitMode && selected && state.split_moves[selected] && state.split_moves[selected].includes(square)) {
                const dot = document.createElement("span");
                dot.className = "split-dot";
                squareEl.appendChild(dot);
            }

            squareEl.addEventListener("click", () => onSquareClick(square, cell));
            boardEl.appendChild(squareEl);
        }
    }

    renderQuantumLinks();
}

function renderQuantumLinks() {
    const existing = boardEl.querySelector(".quantum-link-svg");
    if (existing) {
        existing.remove();
    }
    if (!state.quantum_pairs || state.quantum_pairs.length === 0) {
        return;
    }

    const rect = boardEl.getBoundingClientRect();
    const squareSize = rect.width / 8;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("quantum-link-svg");
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);

    for (const [squareA, squareB] of state.quantum_pairs) {
        const posA = squareToPixel(squareA, squareSize);
        const posB = squareToPixel(squareB, squareSize);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.classList.add("quantum-link-line");
        line.setAttribute("x1", String(posA.x));
        line.setAttribute("y1", String(posA.y));
        line.setAttribute("x2", String(posB.x));
        line.setAttribute("y2", String(posB.y));
        svg.appendChild(line);
    }

    boardEl.appendChild(svg);
}

function squareToPixel(square, squareSize) {
    const col = square.charCodeAt(0) - "a".charCodeAt(0);
    const row = 8 - Number.parseInt(square[1], 10);
    return {
        x: (col * squareSize) + (squareSize / 2),
        y: (row * squareSize) + (squareSize / 2),
    };
}

function renderStatus() {
    const turnName = `${state.turn.charAt(0).toUpperCase()}${state.turn.slice(1)}`;
    turnLabel.textContent = `${turnName} to move`;
    statusDot.className = `status-dot${state.turn === "black" ? " black" : ""}`;

    if (state.winner) {
        const winnerName = `${state.winner.charAt(0).toUpperCase()}${state.winner.slice(1)}`;
        statusMsg.textContent = `${state.is_checkmate ? "Checkmate" : "King captured"} - ${winnerName} wins`;
        statusMsg.className = "status-message check";
    } else if (state.is_stalemate) {
        statusMsg.textContent = "Stalemate - draw";
        statusMsg.className = "status-message";
    } else if (state.in_check) {
        statusMsg.textContent = `${turnName} is in check.`;
        statusMsg.className = "status-message check";
    } else if (splitMode) {
        statusMsg.textContent = "Choose a destination for the split half.";
        statusMsg.className = "status-message";
    } else {
        statusMsg.textContent = "";
        statusMsg.className = "status-message";
    }
}

function renderHistory() {
    if (state.history.length === 0) {
        historyEl.innerHTML = '<div class="history-empty">No moves yet.</div>';
        return;
    }

    const totalMoves = state.history.length;
    let html = "";
    for (let index = 0; index < totalMoves; index += 2) {
        const whiteMove = state.history[index];
        const blackMove = state.history[index + 1] || null;
        const whiteClass = index === totalMoves - 1 ? "history-move latest" : "history-move";
        const blackClass = index + 1 === totalMoves - 1 ? "history-move latest" : "history-move";
        html += `<div class="history-row"><span class="history-num">${whiteMove.move_number}.</span><span class="${whiteClass}">${whiteMove.text}</span><span class="${blackClass}">${blackMove ? blackMove.text : ""}</span></div>`;
    }
    historyEl.innerHTML = html;
    historyEl.scrollTop = historyEl.scrollHeight;
}

function renderCaptured() {
    const whiteCaptured = [];
    const blackCaptured = [];

    for (const move of state.history) {
        const match = move.text.match(/[×x](.)/u);
        if (!match) {
            continue;
        }
        if (move.color === "white") {
            whiteCaptured.push(match[1]);
        } else {
            blackCaptured.push(match[1]);
        }
    }

    capturedWhite.textContent = whiteCaptured.join(" ") || "-";
    capturedBlack.textContent = blackCaptured.join(" ") || "-";
}

function renderCapturedPanel() {
    const whiteCaptured = [];
    const blackCaptured = [];
    const pieceCapturePattern = /[×x]([♔♕♖♗♘♙♚♛♜♝♞♟KQRBNPkqrbnp])/gu;

    for (const move of state.history) {
        const matches = [...move.text.matchAll(pieceCapturePattern)];
        if (matches.length === 0) {
            continue;
        }

        const capturedPiece = matches[matches.length - 1][1];
        if (move.color === "white") {
            whiteCaptured.push(capturedPiece);
        } else {
            blackCaptured.push(capturedPiece);
        }
    }

    capturedWhite.textContent = whiteCaptured.join(" ") || "-";
    capturedBlack.textContent = blackCaptured.join(" ") || "-";
}

function renderSuccessfulCapturedPanel() {
    const whiteCaptured = [];
    const blackCaptured = [];

    for (let index = 0; index < board.moveHistory.length; index += 1) {
        const move = board.moveHistory[index];
        if (!move.captured) {
            continue;
        }

        const capturedSymbol = CAPTURE_SYMBOLS[move.captured] || move.captured;
        const moverColor = index % 2 === 0 ? "white" : "black";
        if (moverColor === "white") {
            whiteCaptured.push(capturedSymbol);
        } else {
            blackCaptured.push(capturedSymbol);
        }
    }

    capturedWhite.textContent = whiteCaptured.join(" ") || "-";
    capturedBlack.textContent = blackCaptured.join(" ") || "-";
}

function renderQuantumPanel() {
    quantumPanel.style.display = "block";

    if (state.pending_quantum_capture || state.winner || state.is_stalemate) {
        splitBtn.disabled = true;
        quantumHint.textContent = "";
        return;
    }

    if (splitMode) {
        splitBtn.disabled = true;
        quantumHint.textContent = "Click a teal dot to place the split half. Press Escape to cancel.";
        return;
    }

    if (selected && state.split_moves[selected] && state.split_moves[selected].length > 0) {
        splitBtn.disabled = false;
        quantumHint.textContent = "This piece can split into two quantum halves.";
        return;
    }

    if (selected) {
        splitBtn.disabled = true;
        const cell = getCellBySquare(selected);
        quantumHint.textContent = cell && cell.is_quantum
            ? "That piece is already quantum."
            : "That piece cannot split right now.";
        return;
    }

    splitBtn.disabled = true;
    quantumHint.textContent = "Select a piece to split.";
}

function getCellBySquare(square) {
    for (const row of state.board) {
        for (const cell of row) {
            if (cell.square === square) {
                return cell;
            }
        }
    }
    return null;
}

function onSquareClick(square, cell) {
    if (state.winner || state.is_stalemate || state.pending_quantum_capture) {
        return;
    }

    if (splitMode && selected) {
        if (state.split_moves[selected] && state.split_moves[selected].includes(square)) {
            board.splitPiece(selected, square);
            selected = null;
            splitMode = false;
            render();
            return;
        }
        splitMode = false;
        selected = null;
        render();
        return;
    }

    if (selected && state.legal_moves[selected]) {
        const match = state.legal_moves[selected].find((move) => move.target === square);
        if (match) {
            board.makeMove(selected, square);
            selected = null;
            splitMode = false;
            render();
            if (board.pendingCapture) {
                showCoinFlip();
            }
            return;
        }
    }

    if (cell.piece && cell.color === state.turn) {
        selected = square;
        splitMode = false;
        render();
        return;
    }

    selected = null;
    splitMode = false;
    render();
}

function resetGame() {
    board.reset();
    selected = null;
    splitMode = false;
    overlayEl.classList.add("hidden");
    coinOverlay.classList.add("hidden");
    render();
}

function showCoinFlip() {
    const pending = board.getBoardState().pending_quantum_capture;
    if (!pending) {
        return;
    }

    coinOverlay.classList.remove("hidden");
    coinEl.className = "coin";
    coinResultText.textContent = "";
    coinFlipBtn.disabled = false;
    coinFlipBtn.textContent = "Flip Coin";

    if (pending.attacker_quantum && pending.defender_quantum) {
        coinDesc.textContent = `Quantum ${pending.attacker_piece} attacks quantum ${pending.defender_piece}. We need two checks.`;
    } else if (pending.attacker_quantum) {
        coinDesc.textContent = `Quantum ${pending.attacker_piece} attacks ${pending.defender_piece}. Is the attacker real?`;
    } else {
        coinDesc.textContent = `${pending.attacker_piece} attacks quantum ${pending.defender_piece}. Is the defender real?`;
    }
}

function playCoinResult(result, index = 0) {
    const flip = result.flips[index];
    const heads = flip.coin === "heads";
    coinEl.className = `coin ${heads ? "result-heads" : "result-tails"}`;
    const actor = flip.actor === "attacker" ? "Attacker" : "Defender";
    coinResultText.textContent = heads
        ? `${actor}: heads, the piece is real.`
        : `${actor}: tails, the piece was not real.`;

    if (index < result.flips.length - 1) {
        window.setTimeout(() => {
            coinEl.className = "coin";
            coinResultText.textContent += " Next flip...";
            window.setTimeout(() => {
                coinEl.className = "coin flipping";
                window.setTimeout(() => playCoinResult(result, index + 1), 1500);
            }, 700);
        }, 1600);
        return;
    }

    if (result.capture_succeeded) {
        coinResultText.textContent += " Capture succeeds.";
    } else if (result.recombined_at) {
        coinResultText.textContent += ` It collapses back at ${result.recombined_at}.`;
    } else {
        coinResultText.textContent += " Capture fails.";
    }

    window.setTimeout(() => {
        coinOverlay.classList.add("hidden");
        render();
    }, 2600);
}

function showGameOver() {
    if (state.winner) {
        const winnerName = `${state.winner.charAt(0).toUpperCase()}${state.winner.slice(1)}`;
        gameOverIcon.textContent = state.winner === "white" ? "♔" : "♚";
        gameOverTitle.textContent = state.is_checkmate ? "Checkmate" : "King Captured";
        gameOverSub.textContent = `${winnerName} wins the game.`;
    } else if (state.is_stalemate) {
        gameOverIcon.textContent = "½";
        gameOverTitle.textContent = "Stalemate";
        gameOverSub.textContent = "No legal moves remain.";
    }
    overlayEl.classList.remove("hidden");
}

splitBtn.addEventListener("click", () => {
    if (!selected || !state.split_moves[selected]) {
        return;
    }
    splitMode = true;
    render();
});

coinFlipBtn.addEventListener("click", () => {
    coinFlipBtn.disabled = true;
    coinFlipBtn.textContent = "Flipping...";
    coinEl.className = "coin flipping";
    window.setTimeout(() => {
        const result = board.resolveQuantumCapture();
        if (!result || result.flips.length === 0) {
            coinOverlay.classList.add("hidden");
            render();
            return;
        }
        playCoinResult(result);
    }, 1500);
});

resetBtn.addEventListener("click", resetGame);
gameOverReset.addEventListener("click", resetGame);

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        selected = null;
        splitMode = false;
        render();
    }
});

setBoardSize();
window.addEventListener("resize", setBoardSize);
render();
