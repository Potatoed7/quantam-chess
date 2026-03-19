/**
 * Quantum Chess — Frontend Logic
 * Click-to-select, legal-move display, quantum split, coin flip, and API communication.
 */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────
    let state = null;
    let selected = null;       // selected square (algebraic)
    let splitMode = false;     // true when user clicked "Split" and is picking a target

    // ── DOM refs ───────────────────────────────────────────────
    const boardEl = document.getElementById('chessboard');
    const turnLabel = document.getElementById('turn-label');
    const statusDot = document.getElementById('status-dot');
    const statusMsg = document.getElementById('status-message');
    const capturedWhite = document.getElementById('captured-white');
    const capturedBlack = document.getElementById('captured-black');
    const historyEl = document.getElementById('move-history');
    const overlayEl = document.getElementById('game-over-overlay');
    const gameOverTitle = document.getElementById('game-over-title');
    const gameOverSub = document.getElementById('game-over-subtitle');
    const gameOverIcon = document.getElementById('game-over-icon');
    const resetBtn = document.getElementById('reset-btn');
    const gameOverReset = document.getElementById('game-over-reset');

    // Quantum UI
    const quantumPanel = document.getElementById('quantum-panel');
    const splitBtn = document.getElementById('split-btn');
    const quantumHint = document.getElementById('quantum-hint');

    // Coin flip
    const coinOverlay = document.getElementById('coin-flip-overlay');
    const coinEl = document.getElementById('coin');
    const coinDesc = document.getElementById('coin-flip-desc');
    const coinResultText = document.getElementById('coin-result-text');
    const coinFlipBtn = document.getElementById('coin-flip-btn');

    // ── Board sizing ───────────────────────────────────────────
    function setBoardSize() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let size;
        if (vw <= 600) {
            size = Math.min(vw - 48, vh - 200);
        } else {
            size = Math.min(560, vh - 200, vw - 560);
        }
        size = Math.max(320, Math.floor(size / 8) * 8);
        document.documentElement.style.setProperty('--board-size', size + 'px');
    }
    setBoardSize();
    window.addEventListener('resize', setBoardSize);

    // ── API helpers ────────────────────────────────────────────
    async function fetchState() {
        const res = await fetch('/api/state');
        state = await res.json();
        render();
    }

    async function sendMove(from, to) {
        const res = await fetch('/api/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to }),
        });
        if (res.ok) {
            state = await res.json();
            selected = null;
            splitMode = false;
            render();

            // Check if a quantum capture is pending
            if (state.pending_quantum_capture) {
                showCoinFlip();
            }
        }
    }

    async function sendSplit(square, target) {
        const res = await fetch('/api/split', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ square, target }),
        });
        if (res.ok) {
            state = await res.json();
            selected = null;
            splitMode = false;
            render();
        }
    }

    async function sendCoinFlip() {
        const res = await fetch('/api/coin_flip', { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            state = data;
            return data.coin_flip_result;
        }
        return null;
    }

    async function resetGame() {
        const res = await fetch('/api/reset', { method: 'POST' });
        state = await res.json();
        selected = null;
        splitMode = false;
        overlayEl.classList.add('hidden');
        coinOverlay.classList.add('hidden');
        render();
    }

    // ── Render ─────────────────────────────────────────────────

    function render() {
        if (!state) return;
        renderBoard();
        renderStatus();
        renderHistory();
        renderCaptured();
        renderQuantumPanel();

        if (state.winner || state.is_checkmate || state.is_stalemate) {
            showGameOver();
        }
    }

    function renderBoard() {
        boardEl.innerHTML = '';

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = state.board[r][c];
                const sq = cell.square;
                const isLight = (r + c) % 2 === 0;

                const div = document.createElement('div');
                div.className = 'square ' + (isLight ? 'light' : 'dark');
                div.dataset.square = sq;

                // Selected highlight
                if (selected === sq) {
                    div.classList.add('selected');
                }

                // Check highlight on king
                if (state.in_check && cell.piece &&
                    cell.piece.toUpperCase() === 'K' &&
                    cell.color === state.turn) {
                    div.classList.add('in-check');
                }

                // Piece
                if (cell.piece) {
                    const pieceSpan = document.createElement('span');
                    let cls = 'piece ';
                    cls += cell.color === 'white' ? 'white-piece' : 'black-piece';
                    if (cell.is_quantum) {
                        cls += ' quantum';
                    }
                    pieceSpan.className = cls;
                    pieceSpan.textContent = cell.symbol;
                    div.appendChild(pieceSpan);
                }

                // Legal-move dots (normal mode)
                if (!splitMode && selected && state.legal_moves[selected]) {
                    const targets = state.legal_moves[selected];
                    const match = targets.find(m => m.target === sq);
                    if (match) {
                        const dot = document.createElement('div');
                        dot.className = 'legal-dot' + (cell.piece ? ' capture' : '');
                        div.appendChild(dot);
                    }
                }

                // Split-move dots (split mode)
                if (splitMode && selected && state.split_moves[selected]) {
                    const targets = state.split_moves[selected];
                    if (targets.includes(sq)) {
                        const dot = document.createElement('div');
                        dot.className = 'split-dot';
                        div.appendChild(dot);
                    }
                }

                div.addEventListener('click', () => onSquareClick(sq, cell));
                boardEl.appendChild(div);
            }
        }

        // Render quantum connection lines
        renderQuantumLinks();
    }

    function renderQuantumLinks() {
        // Remove existing SVG
        const existing = boardEl.querySelector('.quantum-link-svg');
        if (existing) existing.remove();

        if (!state.quantum_pairs || state.quantum_pairs.length === 0) return;

        const boardRect = boardEl.getBoundingClientRect();
        const sqSize = boardRect.width / 8;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('quantum-link-svg');
        svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);

        for (const [sqA, sqB] of state.quantum_pairs) {
            const posA = squareToPixel(sqA, sqSize);
            const posB = squareToPixel(sqB, sqSize);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.classList.add('quantum-link-line');
            line.setAttribute('x1', posA.x);
            line.setAttribute('y1', posA.y);
            line.setAttribute('x2', posB.x);
            line.setAttribute('y2', posB.y);
            svg.appendChild(line);
        }

        boardEl.appendChild(svg);
    }

    function squareToPixel(sq, sqSize) {
        const col = sq.charCodeAt(0) - 'a'.charCodeAt(0);
        const row = 8 - parseInt(sq[1]);
        return {
            x: col * sqSize + sqSize / 2,
            y: row * sqSize + sqSize / 2,
        };
    }

    function renderStatus() {
        const turn = state.turn;
        const name = turn.charAt(0).toUpperCase() + turn.slice(1);
        turnLabel.textContent = name + ' to move';
        statusDot.className = 'status-dot' + (turn === 'black' ? ' black' : '');

        if (state.winner) {
            const winner = state.winner.charAt(0).toUpperCase() + state.winner.slice(1);
            statusMsg.textContent = (state.is_checkmate ? 'Checkmate — ' : 'King Captured — ') + winner + ' wins!';
            statusMsg.className = 'status-message check';
        } else if (state.is_stalemate) {
            statusMsg.textContent = 'Stalemate — Draw';
            statusMsg.className = 'status-message';
        } else if (state.in_check) {
            statusMsg.textContent = '⚠ ' + name + ' is in check!';
            statusMsg.className = 'status-message check';
        } else if (splitMode) {
            statusMsg.textContent = '⚛ Pick a target for the split half';
            statusMsg.className = 'status-message';
        } else {
            statusMsg.textContent = '';
            statusMsg.className = 'status-message';
        }
    }

    function renderHistory() {
        if (state.history.length === 0) {
            historyEl.innerHTML = '<div class="history-empty">No moves yet</div>';
            return;
        }

        let html = '';
        const totalMoves = state.history.length;
        for (let i = 0; i < totalMoves; i += 2) {
            const moveNum = state.history[i].move_number;
            const whiteMove = state.history[i];
            const blackMove = (i + 1 < totalMoves) ? state.history[i + 1] : null;

            const wClass = (i === totalMoves - 1) ? 'history-move latest' : 'history-move';
            const bClass = (i + 1 === totalMoves - 1) ? 'history-move latest' : 'history-move';

            html += '<div class="history-row">';
            html += `<span class="history-num">${moveNum}.</span>`;
            html += `<span class="${wClass}">${whiteMove.text}</span>`;
            html += `<span class="${bClass}">${blackMove ? blackMove.text : ''}</span>`;
            html += '</div>';
        }
        historyEl.innerHTML = html;
        historyEl.scrollTop = historyEl.scrollHeight;
    }

    function renderCaptured() {
        const whiteCaptured = [];
        const blackCaptured = [];

        for (const m of state.history) {
            if (!m.text) continue;
            const capMatch = m.text.match(/×(.)/);
            if (capMatch) {
                const sym = capMatch[1];
                if (m.color === 'white') {
                    whiteCaptured.push(sym);
                } else {
                    blackCaptured.push(sym);
                }
            }
        }

        capturedWhite.textContent = whiteCaptured.join(' ') || '—';
        capturedBlack.textContent = blackCaptured.join(' ') || '—';
    }

    function renderQuantumPanel() {
        // Show the quantum panel always
        quantumPanel.style.display = 'block';

        if (state.pending_quantum_capture || state.winner || state.is_stalemate) {
            splitBtn.disabled = true;
            quantumHint.textContent = '';
            return;
        }

        if (splitMode) {
            splitBtn.disabled = true;
            quantumHint.textContent = 'Click a purple dot to place the split half (Esc to cancel)';
            return;
        }

        // Check if the selected piece can be split
        if (selected && state.split_moves[selected] && state.split_moves[selected].length > 0) {
            splitBtn.disabled = false;
            quantumHint.textContent = 'Split this piece into two quantum halves';
        } else if (selected) {
            splitBtn.disabled = true;
            const cell = getCellBySquare(selected);
            if (cell && cell.is_quantum) {
                quantumHint.textContent = 'Already a quantum piece';
            } else {
                quantumHint.textContent = 'This piece cannot split right now';
            }
        } else {
            splitBtn.disabled = true;
            quantumHint.textContent = 'Select a piece to split';
        }
    }

    function getCellBySquare(sq) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (state.board[r][c].square === sq) {
                    return state.board[r][c];
                }
            }
        }
        return null;
    }

    // ── Interaction ────────────────────────────────────────────

    function onSquareClick(sq, cell) {
        if (state.winner || state.is_stalemate) return;
        if (state.pending_quantum_capture) return;

        // Split mode: clicking a split target
        if (splitMode && selected) {
            if (state.split_moves[selected] && state.split_moves[selected].includes(sq)) {
                sendSplit(selected, sq);
                return;
            }
            // Clicking elsewhere cancels split mode
            splitMode = false;
            selected = null;
            render();
            return;
        }

        // Normal mode: selected piece and clicked a legal target → move
        if (selected && state.legal_moves[selected]) {
            const targets = state.legal_moves[selected];
            const match = targets.find(m => m.target === sq);
            if (match) {
                sendMove(selected, sq);
                return;
            }
        }

        // If clicked own piece → select it
        if (cell.piece && cell.color === state.turn) {
            selected = sq;
            splitMode = false;
            render();
            return;
        }

        // Otherwise deselect
        selected = null;
        splitMode = false;
        render();
    }

    // ── Split ──────────────────────────────────────────────────

    splitBtn.addEventListener('click', () => {
        if (!selected || !state.split_moves[selected]) return;
        splitMode = true;
        render();
    });

    // ── Coin Flip ──────────────────────────────────────────────

    function showCoinFlip() {
        const pc = state.pending_quantum_capture;
        if (!pc) return;

        coinOverlay.classList.remove('hidden');
        coinEl.className = 'coin';
        coinResultText.textContent = '';
        coinFlipBtn.disabled = false;
        coinFlipBtn.textContent = 'Flip the Coin';

        let desc = '';
        if (pc.attacker_quantum && pc.defender_quantum) {
             desc = `Quantum ${pc.attacker_piece} tries to capture quantum ${pc.defender_piece} — are they both real?`;
        } else if (pc.defender_quantum) {
            desc = `${pc.attacker_piece} captures quantum ${pc.defender_piece} — is it real?`;
        } else if (pc.attacker_quantum) {
            desc = `Quantum ${pc.attacker_piece} tries to capture ${pc.defender_piece} — is it real?`;
        }
        coinDesc.textContent = desc;
    }

    coinFlipBtn.addEventListener('click', async () => {
        coinFlipBtn.disabled = true;
        coinFlipBtn.textContent = 'Flipping...';

        // Start spin animation
        coinEl.className = 'coin flipping';

        // Wait for animation to finish, then fetch result
        setTimeout(async () => {
            const result = await sendCoinFlip();

            if (result && result.flips) {
                const playFlip = (flipIndex) => {
                    const flip = result.flips[flipIndex];
                    const isHeads = flip.coin === 'heads';
                    coinEl.className = 'coin ' + (isHeads ? 'result-heads' : 'result-tails');
                    
                    let roleStr = flip.actor === 'attacker' ? 'Attacker' : 'Defender';
                    if (isHeads) {
                        coinResultText.textContent = `👑 HEADS — ${roleStr} quantum piece is REAL!`;
                    } else {
                        coinResultText.textContent = `👻 TAILS — ${roleStr} quantum piece was NOT real!`;
                    }

                    if (flipIndex < result.flips.length - 1) {
                         // There is another flip! Wait, reset, display "Flipping for defender..." and flip again.
                         setTimeout(() => {
                             coinEl.className = 'coin';
                             coinResultText.textContent += ' Flipping for defender...';
                             setTimeout(() => {
                                 coinEl.className = 'coin flipping';
                                 setTimeout(() => playFlip(flipIndex + 1), 1500);
                             }, 800);
                         }, 2000);
                    } else {
                         // Final result text
                         if (result.capture_succeeded) {
                             coinResultText.textContent += ' Capture succeeds!';
                         } else if (result.recombined_at) {
                             coinResultText.textContent += ' It recombines with its partner.';
                         } else {
                             coinResultText.textContent += ' Capture fails.';
                         }

                         setTimeout(() => {
                            coinOverlay.classList.add('hidden');
                            render();
                         }, 3000);
                    }
                };
                
                playFlip(0);
            }
        }, 1500);
    });

    // ── Game Over ──────────────────────────────────────────────

    function showGameOver() {
        if (state.winner) {
            const winner = state.winner.charAt(0).toUpperCase() + state.winner.slice(1);
            gameOverIcon.textContent = winner === 'White' ? '♔' : '♚';
            gameOverTitle.textContent = state.is_checkmate ? 'Checkmate!' : 'King Captured!';
            gameOverSub.textContent = winner + ' wins the game';
        } else if (state.is_stalemate) {
            gameOverIcon.textContent = '½';
            gameOverTitle.textContent = 'Stalemate';
            gameOverSub.textContent = 'The game is a draw';
        }
        overlayEl.classList.remove('hidden');
    }

    // ── Events ─────────────────────────────────────────────────

    resetBtn.addEventListener('click', resetGame);
    gameOverReset.addEventListener('click', resetGame);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            selected = null;
            splitMode = false;
            render();
        }
    });

    // ── Init ───────────────────────────────────────────────────
    fetchState();

})();
