const DISPLAY_PIECES = {
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

function makeGrid(fill = null) {
    return Array.from({ length: 8 }, () => Array(8).fill(fill));
}

export function squareToCoords(square) {
    const col = square.charCodeAt(0) - "a".charCodeAt(0);
    const row = 8 - Number.parseInt(square[1], 10);
    return [row, col];
}

export function coordsToSquare(row, col) {
    return `${String.fromCharCode("a".charCodeAt(0) + col)}${8 - row}`;
}

export class Board {
    constructor() {
        this.reset();
    }

    reset() {
        this.board = makeGrid();
        this.pieceIds = makeGrid();
        this.turn = "white";
        this.enPassantTarget = null;
        this.castlingRights = { K: true, Q: true, k: true, q: true };
        this.moveHistory = [];
        this.nextPieceId = 0;
        this.quantumPairs = {};
        this.quantumHalves = new Set();
        this.pendingCapture = null;
        this.winner = null;
        this.setupInitialPosition();
    }

    assignId(row, col) {
        const pieceId = this.nextPieceId;
        this.nextPieceId += 1;
        this.pieceIds[row][col] = pieceId;
        return pieceId;
    }

    setupInitialPosition() {
        const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];
        this.board[0] = backRank.slice();
        this.board[1] = Array(8).fill("p");
        this.board[6] = Array(8).fill("P");
        this.board[7] = backRank.map((piece) => piece.toUpperCase());

        for (let row = 0; row < 8; row += 1) {
            for (let col = 0; col < 8; col += 1) {
                if (this.board[row][col] !== null) {
                    this.assignId(row, col);
                }
            }
        }
    }

    pieceColor(piece) {
        if (!piece) {
            return null;
        }
        return piece === piece.toUpperCase() ? "white" : "black";
    }

    opponent(color) {
        return color === "white" ? "black" : "white";
    }

    inBounds(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    findAllKings(color) {
        const target = color === "white" ? "K" : "k";
        const positions = [];
        for (let row = 0; row < 8; row += 1) {
            for (let col = 0; col < 8; col += 1) {
                if (this.board[row][col] === target) {
                    positions.push([row, col]);
                }
            }
        }
        return positions;
    }

    getPartnerPos(row, col) {
        const pieceId = this.pieceIds[row][col];
        if (pieceId === null || pieceId === undefined || !(pieceId in this.quantumPairs)) {
            return null;
        }
        const partnerId = this.quantumPairs[pieceId];
        for (let r = 0; r < 8; r += 1) {
            for (let c = 0; c < 8; c += 1) {
                if (this.pieceIds[r][c] === partnerId) {
                    return [r, c];
                }
            }
        }
        return null;
    }

    isSquareAttackedBy(row, col, attackerColor) {
        for (let fromRow = 0; fromRow < 8; fromRow += 1) {
            for (let fromCol = 0; fromCol < 8; fromCol += 1) {
                const piece = this.board[fromRow][fromCol];
                if (!piece || this.pieceColor(piece) !== attackerColor) {
                    continue;
                }
                if (this.canPieceAttack(fromRow, fromCol, row, col)) {
                    return true;
                }
            }
        }
        return false;
    }

    canPieceAttack(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        if (!piece) {
            return false;
        }
        const kind = piece.toUpperCase();
        const dRow = toRow - fromRow;
        const dCol = toCol - fromCol;

        if (kind === "P") {
            const direction = piece === piece.toUpperCase() ? -1 : 1;
            return dRow === direction && Math.abs(dCol) === 1;
        }
        if (kind === "N") {
            return (Math.abs(dRow) === 1 && Math.abs(dCol) === 2) ||
                (Math.abs(dRow) === 2 && Math.abs(dCol) === 1);
        }
        if (kind === "K") {
            return Math.max(Math.abs(dRow), Math.abs(dCol)) === 1;
        }
        if (kind === "B") {
            return this.attacksDiagonal(fromRow, fromCol, toRow, toCol);
        }
        if (kind === "R") {
            return this.attacksStraight(fromRow, fromCol, toRow, toCol);
        }
        if (kind === "Q") {
            return this.attacksDiagonal(fromRow, fromCol, toRow, toCol) ||
                this.attacksStraight(fromRow, fromCol, toRow, toCol);
        }
        return false;
    }

    attacksStraight(fromRow, fromCol, toRow, toCol) {
        const dRow = toRow - fromRow;
        const dCol = toCol - fromCol;
        if (dRow !== 0 && dCol !== 0) {
            return false;
        }
        const stepRow = dRow === 0 ? 0 : dRow > 0 ? 1 : -1;
        const stepCol = dCol === 0 ? 0 : dCol > 0 ? 1 : -1;
        let row = fromRow + stepRow;
        let col = fromCol + stepCol;
        while (row !== toRow || col !== toCol) {
            if (this.board[row][col] !== null) {
                return false;
            }
            row += stepRow;
            col += stepCol;
        }
        return true;
    }

    attacksDiagonal(fromRow, fromCol, toRow, toCol) {
        const dRow = toRow - fromRow;
        const dCol = toCol - fromCol;
        if (Math.abs(dRow) !== Math.abs(dCol) || dRow === 0) {
            return false;
        }
        const stepRow = dRow > 0 ? 1 : -1;
        const stepCol = dCol > 0 ? 1 : -1;
        let row = fromRow + stepRow;
        let col = fromCol + stepCol;
        while (row !== toRow || col !== toCol) {
            if (this.board[row][col] !== null) {
                return false;
            }
            row += stepRow;
            col += stepCol;
        }
        return true;
    }

    isInCheck(color) {
        const kingPositions = this.findAllKings(color);
        const enemy = this.opponent(color);
        for (const [row, col] of kingPositions) {
            const pieceId = this.pieceIds[row][col];
            if (this.quantumHalves.has(pieceId)) {
                continue;
            }
            if (this.isSquareAttackedBy(row, col, enemy)) {
                return true;
            }
        }
        return false;
    }

    *pseudoLegalMoves(color) {
        for (let row = 0; row < 8; row += 1) {
            for (let col = 0; col < 8; col += 1) {
                const piece = this.board[row][col];
                if (!piece || this.pieceColor(piece) !== color) {
                    continue;
                }
                const kind = piece.toUpperCase();
                if (kind === "P") {
                    yield* this.pawnMoves(row, col, color);
                } else if (kind === "N") {
                    yield* this.knightMoves(row, col, color);
                } else if (kind === "B") {
                    yield* this.slidingMoves(row, col, color, true, false);
                } else if (kind === "R") {
                    yield* this.slidingMoves(row, col, color, false, true);
                } else if (kind === "Q") {
                    yield* this.slidingMoves(row, col, color, true, true);
                } else if (kind === "K") {
                    yield* this.kingMoves(row, col, color);
                }

                const pieceId = this.pieceIds[row][col];
                if (pieceId !== null && this.quantumHalves.has(pieceId)) {
                    yield* this.recombineMoves(row, col, color, kind);
                }
            }
        }
    }

    *pawnMoves(row, col, color) {
        const direction = color === "white" ? -1 : 1;
        const startRow = color === "white" ? 6 : 1;
        const promotionRow = color === "white" ? 0 : 7;
        const nextRow = row + direction;

        if (this.inBounds(nextRow, col) && this.board[nextRow][col] === null) {
            yield [row, col, nextRow, col, nextRow === promotionRow ? "promote_q" : null];
            if (row === startRow) {
                const jumpRow = row + (2 * direction);
                if (this.board[jumpRow][col] === null) {
                    yield [row, col, jumpRow, col, null];
                }
            }
        }

        for (const dCol of [-1, 1]) {
            const nextCol = col + dCol;
            if (!this.inBounds(nextRow, nextCol)) {
                continue;
            }
            const target = this.board[nextRow][nextCol];
            if (target && this.pieceColor(target) !== color) {
                yield [row, col, nextRow, nextCol, nextRow === promotionRow ? "promote_q" : null];
            }
            if (this.enPassantTarget && this.enPassantTarget[0] === nextRow && this.enPassantTarget[1] === nextCol) {
                yield [row, col, nextRow, nextCol, "en_passant"];
            }
        }
    }

    *knightMoves(row, col, color) {
        const offsets = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1],
        ];
        for (const [dRow, dCol] of offsets) {
            const nextRow = row + dRow;
            const nextCol = col + dCol;
            if (!this.inBounds(nextRow, nextCol)) {
                continue;
            }
            const target = this.board[nextRow][nextCol];
            if (!target || this.pieceColor(target) !== color) {
                yield [row, col, nextRow, nextCol, null];
            }
        }
    }

    *slidingMoves(row, col, color, diagonal, straight) {
        const directions = [];
        if (straight) {
            directions.push([0, 1], [0, -1], [1, 0], [-1, 0]);
        }
        if (diagonal) {
            directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        }
        for (const [dRow, dCol] of directions) {
            let nextRow = row + dRow;
            let nextCol = col + dCol;
            while (this.inBounds(nextRow, nextCol)) {
                const target = this.board[nextRow][nextCol];
                if (!target) {
                    yield [row, col, nextRow, nextCol, null];
                } else if (this.pieceColor(target) !== color) {
                    yield [row, col, nextRow, nextCol, null];
                    break;
                } else {
                    break;
                }
                nextRow += dRow;
                nextCol += dCol;
            }
        }
    }

    *kingMoves(row, col, color) {
        for (let dRow = -1; dRow <= 1; dRow += 1) {
            for (let dCol = -1; dCol <= 1; dCol += 1) {
                if (dRow === 0 && dCol === 0) {
                    continue;
                }
                const nextRow = row + dRow;
                const nextCol = col + dCol;
                if (!this.inBounds(nextRow, nextCol)) {
                    continue;
                }
                const target = this.board[nextRow][nextCol];
                if (!target || this.pieceColor(target) !== color) {
                    yield [row, col, nextRow, nextCol, null];
                }
            }
        }
        yield* this.castlingMoves(row, col, color);
    }

    *castlingMoves(row, col, color) {
        const enemy = this.opponent(color);
        if (this.isInCheck(color)) {
            return;
        }
        const pieceId = this.pieceIds[row][col];
        if (pieceId !== null && this.quantumHalves.has(pieceId)) {
            return;
        }

        if (color === "white") {
            if (this.castlingRights.K &&
                this.board[7][5] === null &&
                this.board[7][6] === null &&
                !this.isSquareAttackedBy(7, 5, enemy) &&
                !this.isSquareAttackedBy(7, 6, enemy)) {
                yield [7, 4, 7, 6, "castle_king"];
            }
            if (this.castlingRights.Q &&
                this.board[7][3] === null &&
                this.board[7][2] === null &&
                this.board[7][1] === null &&
                !this.isSquareAttackedBy(7, 3, enemy) &&
                !this.isSquareAttackedBy(7, 2, enemy)) {
                yield [7, 4, 7, 2, "castle_queen"];
            }
        } else {
            if (this.castlingRights.k &&
                this.board[0][5] === null &&
                this.board[0][6] === null &&
                !this.isSquareAttackedBy(0, 5, enemy) &&
                !this.isSquareAttackedBy(0, 6, enemy)) {
                yield [0, 4, 0, 6, "castle_king"];
            }
            if (this.castlingRights.q &&
                this.board[0][3] === null &&
                this.board[0][2] === null &&
                this.board[0][1] === null &&
                !this.isSquareAttackedBy(0, 3, enemy) &&
                !this.isSquareAttackedBy(0, 2, enemy)) {
                yield [0, 4, 0, 2, "castle_queen"];
            }
        }
    }

    *recombineMoves(row, col, color, kind) {
        const pieceId = this.pieceIds[row][col];
        if (!(pieceId in this.quantumPairs)) {
            return;
        }
        const partnerId = this.quantumPairs[pieceId];
        let partnerPos = null;
        for (let r = 0; r < 8 && !partnerPos; r += 1) {
            for (let c = 0; c < 8; c += 1) {
                if (this.pieceIds[r][c] === partnerId) {
                    partnerPos = [r, c];
                    break;
                }
            }
        }
        if (!partnerPos) {
            return;
        }

        const [targetRow, targetCol] = partnerPos;
        const dRow = targetRow - row;
        const dCol = targetCol - col;
        let canReach = false;

        if (kind === "N") {
            canReach = (Math.abs(dRow) === 1 && Math.abs(dCol) === 2) ||
                (Math.abs(dRow) === 2 && Math.abs(dCol) === 1);
        } else if (kind === "K") {
            canReach = Math.max(Math.abs(dRow), Math.abs(dCol)) === 1;
        } else if (kind === "B") {
            canReach = this.attacksDiagonal(row, col, targetRow, targetCol);
        } else if (kind === "R") {
            canReach = this.attacksStraight(row, col, targetRow, targetCol);
        } else if (kind === "Q") {
            canReach = this.attacksDiagonal(row, col, targetRow, targetCol) ||
                this.attacksStraight(row, col, targetRow, targetCol);
        } else if (kind === "P") {
            const direction = color === "white" ? -1 : 1;
            const startRow = color === "white" ? 6 : 1;
            if (dCol === 0 && dRow === direction) {
                canReach = true;
            }
            if (dCol === 0 && dRow === 2 * direction && row === startRow) {
                const middleRow = row + direction;
                if (this.board[middleRow][col] === null) {
                    canReach = true;
                }
            }
        }

        if (canReach) {
            yield [row, col, targetRow, targetCol, "recombine"];
        }
    }

    generateLegalMoves() {
        const legalMoves = [];
        for (const move of this.pseudoLegalMoves(this.turn)) {
            if (this.isMoveLegal(move)) {
                legalMoves.push(move);
            }
        }
        return legalMoves;
    }

    isMoveLegal(move) {
        const [fromRow, fromCol, toRow, toCol, special] = move;
        const captured = this.board[toRow][toCol];
        const moving = this.board[fromRow][fromCol];
        const movingId = this.pieceIds[fromRow][fromCol];
        const capturedId = this.pieceIds[toRow][toCol];
        let enPassantCapturedPiece = null;
        let enPassantCapturedId = null;
        let enPassantPos = null;

        if (special === "recombine") {
            this.board[fromRow][fromCol] = null;
            this.pieceIds[fromRow][fromCol] = null;
            const inCheck = this.isInCheck(this.turn);
            this.board[fromRow][fromCol] = moving;
            this.pieceIds[fromRow][fromCol] = movingId;
            return !inCheck;
        }

        this.board[toRow][toCol] = moving;
        this.board[fromRow][fromCol] = null;
        this.pieceIds[toRow][toCol] = movingId;
        this.pieceIds[fromRow][fromCol] = null;

        if (special === "en_passant") {
            const direction = this.turn === "white" ? -1 : 1;
            enPassantPos = [toRow - direction, toCol];
            enPassantCapturedPiece = this.board[enPassantPos[0]][enPassantPos[1]];
            enPassantCapturedId = this.pieceIds[enPassantPos[0]][enPassantPos[1]];
            this.board[enPassantPos[0]][enPassantPos[1]] = null;
            this.pieceIds[enPassantPos[0]][enPassantPos[1]] = null;
        }

        if (special === "promote_q") {
            this.board[toRow][toCol] = this.turn === "white" ? "Q" : "q";
        }

        if (special === "castle_king") {
            const rookRow = this.turn === "white" ? 7 : 0;
            const rookId = this.pieceIds[rookRow][7];
            this.board[rookRow][5] = this.board[rookRow][7];
            this.pieceIds[rookRow][5] = rookId;
            this.board[rookRow][7] = null;
            this.pieceIds[rookRow][7] = null;
        }

        if (special === "castle_queen") {
            const rookRow = this.turn === "white" ? 7 : 0;
            const rookId = this.pieceIds[rookRow][0];
            this.board[rookRow][3] = this.board[rookRow][0];
            this.pieceIds[rookRow][3] = rookId;
            this.board[rookRow][0] = null;
            this.pieceIds[rookRow][0] = null;
        }

        const inCheck = this.isInCheck(this.turn);

        this.board[fromRow][fromCol] = moving;
        this.pieceIds[fromRow][fromCol] = movingId;
        this.board[toRow][toCol] = captured;
        this.pieceIds[toRow][toCol] = capturedId;

        if (special === "en_passant" && enPassantPos) {
            this.board[enPassantPos[0]][enPassantPos[1]] = enPassantCapturedPiece;
            this.pieceIds[enPassantPos[0]][enPassantPos[1]] = enPassantCapturedId;
        }

        if (special === "promote_q") {
            this.board[fromRow][fromCol] = this.turn === "white" ? "P" : "p";
        }

        if (special === "castle_king") {
            const rookRow = this.turn === "white" ? 7 : 0;
            this.board[rookRow][7] = this.board[rookRow][5];
            this.pieceIds[rookRow][7] = this.pieceIds[rookRow][5];
            this.board[rookRow][5] = null;
            this.pieceIds[rookRow][5] = null;
        }

        if (special === "castle_queen") {
            const rookRow = this.turn === "white" ? 7 : 0;
            this.board[rookRow][0] = this.board[rookRow][3];
            this.pieceIds[rookRow][0] = this.pieceIds[rookRow][3];
            this.board[rookRow][3] = null;
            this.pieceIds[rookRow][3] = null;
        }

        return !inCheck;
    }

    makeMove(fromSquare, toSquare) {
        const [fromRow, fromCol] = Array.isArray(fromSquare) ? fromSquare : squareToCoords(fromSquare);
        const [toRow, toCol] = Array.isArray(toSquare) ? toSquare : squareToCoords(toSquare);
        const legalMoves = this.generateLegalMoves();
        const move = legalMoves.find(([fr, fc, tr, tc]) =>
            fr === fromRow && fc === fromCol && tr === toRow && tc === toCol);

        if (!move) {
            return false;
        }

        const [, , , , special] = move;
        const captured = this.board[toRow][toCol];
        const moving = this.board[fromRow][fromCol];
        const movingId = this.pieceIds[fromRow][fromCol];
        const capturedId = this.pieceIds[toRow][toCol];

        let isCapture = captured !== null && this.pieceColor(captured) !== this.pieceColor(moving);
        let enPassantQuantum = false;
        if (special === "en_passant") {
            const direction = this.turn === "white" ? -1 : 1;
            const enPassantRow = toRow - direction;
            const enPassantId = this.pieceIds[enPassantRow][toCol];
            enPassantQuantum = this.quantumHalves.has(enPassantId);
            isCapture = true;
        }

        const attackerQuantum = this.quantumHalves.has(movingId);
        let defenderQuantum = isCapture && capturedId !== null && this.quantumHalves.has(capturedId);
        if (special === "en_passant") {
            defenderQuantum = enPassantQuantum;
        }

        if (isCapture && (attackerQuantum || defenderQuantum)) {
            this.pendingCapture = {
                from: [fromRow, fromCol],
                to: [toRow, toCol],
                special,
                moving,
                movingId,
                captured,
                capturedId,
                attackerQuantum,
                defenderQuantum,
            };
            return { quantum_capture_pending: true };
        }

        if (this.quantumHalves.has(movingId) &&
            captured !== null &&
            this.pieceColor(captured) === this.pieceColor(moving)) {
            const partnerId = this.quantumPairs[movingId];
            if (partnerId === capturedId) {
                return this.recombineMove(fromRow, fromCol, toRow, toCol, moving, movingId, capturedId);
            }
        }

        return this.executeNormalMove(fromRow, fromCol, toRow, toCol, special, moving, movingId, captured, capturedId);
    }

    executeNormalMove(fromRow, fromCol, toRow, toCol, special, moving, movingId, captured) {
        this.moveHistory.push({
            from: [fromRow, fromCol],
            to: [toRow, toCol],
            piece: moving,
            captured,
            special,
            en_passant_target: this.enPassantTarget ? [...this.enPassantTarget] : null,
            castling_rights: { ...this.castlingRights },
            quantum_event: null,
        });

        this.board[toRow][toCol] = moving;
        this.board[fromRow][fromCol] = null;
        this.pieceIds[toRow][toCol] = movingId;
        this.pieceIds[fromRow][fromCol] = null;

        if (special === "en_passant") {
            const direction = this.turn === "white" ? -1 : 1;
            const enPassantRow = toRow - direction;
            this.board[enPassantRow][toCol] = null;
            this.pieceIds[enPassantRow][toCol] = null;
        }

        if (special === "promote_q") {
            this.board[toRow][toCol] = this.turn === "white" ? "Q" : "q";
        }

        if (special === "castle_king") {
            const rookRow = this.turn === "white" ? 7 : 0;
            const rookId = this.pieceIds[rookRow][7];
            this.board[rookRow][5] = this.board[rookRow][7];
            this.pieceIds[rookRow][5] = rookId;
            this.board[rookRow][7] = null;
            this.pieceIds[rookRow][7] = null;
        }

        if (special === "castle_queen") {
            const rookRow = this.turn === "white" ? 7 : 0;
            const rookId = this.pieceIds[rookRow][0];
            this.board[rookRow][3] = this.board[rookRow][0];
            this.pieceIds[rookRow][3] = rookId;
            this.board[rookRow][0] = null;
            this.pieceIds[rookRow][0] = null;
        }

        this.enPassantTarget = null;
        if (moving && moving.toUpperCase() === "P" && Math.abs(toRow - fromRow) === 2) {
            this.enPassantTarget = [Math.floor((fromRow + toRow) / 2), fromCol];
        }

        this.updateCastlingRights(fromRow, fromCol, toRow, toCol, moving);
        this.turn = this.opponent(this.turn);
        return true;
    }

    recombineMove(fromRow, fromCol, toRow, toCol, moving, movingId, capturedId) {
        this.moveHistory.push({
            from: [fromRow, fromCol],
            to: [toRow, toCol],
            piece: moving,
            captured: null,
            special: "recombine",
            en_passant_target: this.enPassantTarget ? [...this.enPassantTarget] : null,
            castling_rights: { ...this.castlingRights },
            quantum_event: "recombine",
        });

        this.board[fromRow][fromCol] = null;
        this.pieceIds[fromRow][fromCol] = null;
        this.quantumHalves.delete(movingId);
        this.quantumHalves.delete(capturedId);
        delete this.quantumPairs[movingId];
        delete this.quantumPairs[capturedId];
        this.enPassantTarget = null;
        this.turn = this.opponent(this.turn);
        return true;
    }

    updateCastlingRights(fromRow, fromCol, toRow, toCol, moving) {
        if (moving === "K") {
            this.castlingRights.K = false;
            this.castlingRights.Q = false;
        } else if (moving === "k") {
            this.castlingRights.k = false;
            this.castlingRights.q = false;
        }

        if (moving === "R") {
            if (fromRow === 7 && fromCol === 7) {
                this.castlingRights.K = false;
            } else if (fromRow === 7 && fromCol === 0) {
                this.castlingRights.Q = false;
            }
        } else if (moving === "r") {
            if (fromRow === 0 && fromCol === 7) {
                this.castlingRights.k = false;
            } else if (fromRow === 0 && fromCol === 0) {
                this.castlingRights.q = false;
            }
        }

        if (toRow === 7 && toCol === 7) {
            this.castlingRights.K = false;
        } else if (toRow === 7 && toCol === 0) {
            this.castlingRights.Q = false;
        } else if (toRow === 0 && toCol === 7) {
            this.castlingRights.k = false;
        } else if (toRow === 0 && toCol === 0) {
            this.castlingRights.q = false;
        }
    }

    generateSplitMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece) {
            return [];
        }
        const pieceId = this.pieceIds[row][col];
        if (this.quantumHalves.has(pieceId)) {
            return [];
        }

        const color = this.pieceColor(piece);
        if (color !== this.turn) {
            return [];
        }

        let moves = [];
        const kind = piece.toUpperCase();
        if (kind === "P") {
            moves = [...this.pawnMoves(row, col, color)];
        } else if (kind === "N") {
            moves = [...this.knightMoves(row, col, color)];
        } else if (kind === "B") {
            moves = [...this.slidingMoves(row, col, color, true, false)];
        } else if (kind === "R") {
            moves = [...this.slidingMoves(row, col, color, false, true)];
        } else if (kind === "Q") {
            moves = [...this.slidingMoves(row, col, color, true, true)];
        } else if (kind === "K") {
            for (let dRow = -1; dRow <= 1; dRow += 1) {
                for (let dCol = -1; dCol <= 1; dCol += 1) {
                    if (dRow === 0 && dCol === 0) {
                        continue;
                    }
                    const nextRow = row + dRow;
                    const nextCol = col + dCol;
                    if (!this.inBounds(nextRow, nextCol)) {
                        continue;
                    }
                    const target = this.board[nextRow][nextCol];
                    if (!target || this.pieceColor(target) !== color) {
                        moves.push([row, col, nextRow, nextCol, null]);
                    }
                }
            }
        }

        const targets = [];
        for (const [, , targetRow, targetCol, special] of moves) {
            if (["castle_king", "castle_queen", "en_passant", "promote_q"].includes(special)) {
                continue;
            }
            if (this.board[targetRow][targetCol] !== null) {
                continue;
            }

            this.board[targetRow][targetCol] = piece;
            const newId = this.nextPieceId;
            this.pieceIds[targetRow][targetCol] = newId;

            const isKing = piece.toUpperCase() === "K";
            if (isKing) {
                this.quantumHalves.add(pieceId);
                this.quantumHalves.add(newId);
            }

            const inCheck = this.isInCheck(color);

            if (isKing) {
                this.quantumHalves.delete(pieceId);
                this.quantumHalves.delete(newId);
            }

            this.board[targetRow][targetCol] = null;
            this.pieceIds[targetRow][targetCol] = null;

            if (!inCheck) {
                targets.push([targetRow, targetCol]);
            }
        }
        return targets;
    }

    splitPiece(fromSquare, toSquare) {
        const [row, col] = Array.isArray(fromSquare) ? fromSquare : squareToCoords(fromSquare);
        const [targetRow, targetCol] = Array.isArray(toSquare) ? toSquare : squareToCoords(toSquare);
        const piece = this.board[row][col];
        if (!piece) {
            return false;
        }
        const pieceId = this.pieceIds[row][col];
        if (this.quantumHalves.has(pieceId)) {
            return false;
        }
        const color = this.pieceColor(piece);
        if (color !== this.turn) {
            return false;
        }
        const validTargets = this.generateSplitMoves(row, col);
        const valid = validTargets.some(([r, c]) => r === targetRow && c === targetCol);
        if (!valid) {
            return false;
        }

        const newId = this.nextPieceId;
        this.nextPieceId += 1;
        this.board[targetRow][targetCol] = piece;
        this.pieceIds[targetRow][targetCol] = newId;
        this.quantumHalves.add(pieceId);
        this.quantumHalves.add(newId);
        this.quantumPairs[pieceId] = newId;
        this.quantumPairs[newId] = pieceId;

        this.moveHistory.push({
            from: [row, col],
            to: [targetRow, targetCol],
            piece,
            captured: null,
            special: "split",
            en_passant_target: this.enPassantTarget ? [...this.enPassantTarget] : null,
            castling_rights: { ...this.castlingRights },
            quantum_event: "split",
        });

        this.enPassantTarget = null;
        this.turn = this.opponent(this.turn);
        return true;
    }

    resolveQuantumCapture() {
        if (!this.pendingCapture) {
            return null;
        }

        const {
            from,
            to,
            special,
            moving,
            movingId,
            captured,
            capturedId,
            attackerQuantum,
            defenderQuantum,
        } = this.pendingCapture;

        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const flips = [];
        const result = {
            flips,
            events: [],
            capture_succeeded: false,
            recombined_at: null,
        };

        let attackerReal = true;
        if (attackerQuantum) {
            const coin = Math.random() < 0.5 ? "heads" : "tails";
            flips.push({ actor: "attacker", coin });
            if (coin === "tails") {
                attackerReal = false;
                result.events.push("attacker_fake");
                const partnerPos = this.getPartnerPos(fromRow, fromCol);
                this.recombineVanish(movingId);
                this.board[fromRow][fromCol] = null;
                this.pieceIds[fromRow][fromCol] = null;
                result.recombined_at = partnerPos ? coordsToSquare(partnerPos[0], partnerPos[1]) : null;
            } else {
                result.events.push("attacker_real");
            }
        }

        if (attackerReal) {
            let defenderReal = true;
            if (defenderQuantum) {
                const coin = Math.random() < 0.5 ? "heads" : "tails";
                flips.push({ actor: "defender", coin });
                if (coin === "tails") {
                    defenderReal = false;
                    result.events.push("defender_fake");
                    const partnerPos = this.getPartnerPos(toRow, toCol);
                    this.recombineVanish(capturedId);
                    this.collapseRealQuantumAttacker(movingId);
                    this.board[toRow][toCol] = moving;
                    this.pieceIds[toRow][toCol] = movingId;
                    this.board[fromRow][fromCol] = null;
                    this.pieceIds[fromRow][fromCol] = null;
                    result.capture_succeeded = false;
                    result.recombined_at = partnerPos ? coordsToSquare(partnerPos[0], partnerPos[1]) : null;

                    if (special === "en_passant") {
                        const direction = this.turn === "white" ? -1 : 1;
                        const enPassantRow = toRow - direction;
                        const enPassantId = this.pieceIds[enPassantRow][toCol];
                        if (enPassantId !== null && this.quantumHalves.has(enPassantId)) {
                            this.recombineVanish(enPassantId);
                            this.board[enPassantRow][toCol] = null;
                            this.pieceIds[enPassantRow][toCol] = null;
                        }
                    }
                } else {
                    result.events.push("defender_real");
                }
            }

            if (defenderReal) {
                if (defenderQuantum) {
                    this.removeQuantumPair(capturedId);
                }
                this.collapseRealQuantumAttacker(movingId);
                this.board[toRow][toCol] = moving;
                this.pieceIds[toRow][toCol] = movingId;
                this.board[fromRow][fromCol] = null;
                this.pieceIds[fromRow][fromCol] = null;
                result.capture_succeeded = true;

                if (special === "en_passant") {
                    const direction = this.turn === "white" ? -1 : 1;
                    const enPassantRow = toRow - direction;
                    const enPassantId = this.pieceIds[enPassantRow][toCol];
                    if (defenderQuantum && enPassantId !== null) {
                        this.removeQuantumPair(enPassantId);
                    }
                    this.board[enPassantRow][toCol] = null;
                    this.pieceIds[enPassantRow][toCol] = null;
                }
            }
        }

        this.checkForWinner();
        this.moveHistory.push({
            from: [fromRow, fromCol],
            to: [toRow, toCol],
            piece: moving,
            captured: result.capture_succeeded ? captured : null,
            special,
            en_passant_target: this.enPassantTarget ? [...this.enPassantTarget] : null,
            castling_rights: { ...this.castlingRights },
            quantum_event: `flips_${flips.length}`,
        });

        this.enPassantTarget = null;
        if (moving && moving.toUpperCase() === "P" && Math.abs(toRow - fromRow) === 2) {
            this.enPassantTarget = [Math.floor((fromRow + toRow) / 2), fromCol];
        }

        this.updateCastlingRights(fromRow, fromCol, toRow, toCol, moving);
        this.turn = this.opponent(this.turn);
        this.pendingCapture = null;
        return result;
    }

    removeQuantumPair(pieceId) {
        if (!(pieceId in this.quantumPairs)) {
            return;
        }
        const partnerId = this.quantumPairs[pieceId];
        for (let row = 0; row < 8; row += 1) {
            for (let col = 0; col < 8; col += 1) {
                if (this.pieceIds[row][col] === partnerId) {
                    this.board[row][col] = null;
                    this.pieceIds[row][col] = null;
                    break;
                }
            }
        }
        this.quantumHalves.delete(pieceId);
        this.quantumHalves.delete(partnerId);
        delete this.quantumPairs[pieceId];
        delete this.quantumPairs[partnerId];
    }

    collapseRealQuantumAttacker(pieceId) {
        if (!(pieceId in this.quantumPairs)) {
            return;
        }
        const partnerId = this.quantumPairs[pieceId];
        for (let row = 0; row < 8; row += 1) {
            for (let col = 0; col < 8; col += 1) {
                if (this.pieceIds[row][col] === partnerId) {
                    this.board[row][col] = null;
                    this.pieceIds[row][col] = null;
                    break;
                }
            }
        }
        this.quantumHalves.delete(pieceId);
        this.quantumHalves.delete(partnerId);
        delete this.quantumPairs[pieceId];
        delete this.quantumPairs[partnerId];
    }

    recombineVanish(pieceId) {
        if (!(pieceId in this.quantumPairs)) {
            return;
        }
        const partnerId = this.quantumPairs[pieceId];
        this.quantumHalves.delete(pieceId);
        this.quantumHalves.delete(partnerId);
        delete this.quantumPairs[pieceId];
        delete this.quantumPairs[partnerId];
    }

    checkForWinner() {
        const whiteKings = this.findAllKings("white");
        const blackKings = this.findAllKings("black");
        if (whiteKings.length === 0) {
            this.winner = "black";
        } else if (blackKings.length === 0) {
            this.winner = "white";
        }
    }

    cancelPendingCapture() {
        this.pendingCapture = null;
    }

    isCheckmate() {
        if (this.pendingCapture) {
            return false;
        }
        return this.generateLegalMoves().length === 0 && this.isInCheck(this.turn);
    }

    isStalemate() {
        if (this.pendingCapture) {
            return false;
        }
        return this.generateLegalMoves().length === 0 && !this.isInCheck(this.turn);
    }

    getBoardState() {
        const boardData = [];
        for (let row = 0; row < 8; row += 1) {
            const dataRow = [];
            for (let col = 0; col < 8; col += 1) {
                const piece = this.board[row][col];
                const pieceId = this.pieceIds[row][col];
                const isQuantum = pieceId !== null && this.quantumHalves.has(pieceId);
                let partnerSquare = null;
                if (isQuantum) {
                    const partnerPos = this.getPartnerPos(row, col);
                    if (partnerPos) {
                        partnerSquare = coordsToSquare(partnerPos[0], partnerPos[1]);
                    }
                }
                dataRow.push({
                    piece,
                    symbol: DISPLAY_PIECES[piece] || "",
                    color: this.pieceColor(piece),
                    square: coordsToSquare(row, col),
                    piece_id: pieceId,
                    is_quantum: isQuantum,
                    partner_square: partnerSquare,
                });
            }
            boardData.push(dataRow);
        }

        const legalMoves = {};
        if (!this.pendingCapture) {
            for (const [fromRow, fromCol, toRow, toCol, special] of this.generateLegalMoves()) {
                const source = coordsToSquare(fromRow, fromCol);
                const target = coordsToSquare(toRow, toCol);
                if (!legalMoves[source]) {
                    legalMoves[source] = [];
                }
                legalMoves[source].push({ target, special });
            }
        }

        const splitMoves = {};
        if (!this.pendingCapture) {
            for (let row = 0; row < 8; row += 1) {
                for (let col = 0; col < 8; col += 1) {
                    const piece = this.board[row][col];
                    if (!piece || this.pieceColor(piece) !== this.turn) {
                        continue;
                    }
                    const pieceId = this.pieceIds[row][col];
                    if (this.quantumHalves.has(pieceId)) {
                        continue;
                    }
                    const targets = this.generateSplitMoves(row, col);
                    if (targets.length > 0) {
                        splitMoves[coordsToSquare(row, col)] = targets.map(([r, c]) => coordsToSquare(r, c));
                    }
                }
            }
        }

        const quantumPairs = [];
        const seen = new Set();
        for (const [pieceIdKey, partnerId] of Object.entries(this.quantumPairs)) {
            const pieceId = Number(pieceIdKey);
            const pairKey = [pieceId, partnerId].sort((a, b) => a - b).join("-");
            if (seen.has(pairKey)) {
                continue;
            }
            seen.add(pairKey);
            let posA = null;
            let posB = null;
            for (let row = 0; row < 8; row += 1) {
                for (let col = 0; col < 8; col += 1) {
                    if (this.pieceIds[row][col] === pieceId) {
                        posA = coordsToSquare(row, col);
                    } else if (this.pieceIds[row][col] === partnerId) {
                        posB = coordsToSquare(row, col);
                    }
                }
            }
            if (posA && posB) {
                quantumPairs.push([posA, posB]);
            }
        }

        const history = this.moveHistory.map((move, index) => {
            const [fromRow, fromCol] = move.from;
            const [toRow, toCol] = move.to;
            const pieceSymbol = DISPLAY_PIECES[move.piece] || move.piece;
            const fromSquare = coordsToSquare(fromRow, fromCol);
            const toSquare = coordsToSquare(toRow, toCol);
            let text = `${pieceSymbol} ${fromSquare}→${toSquare}`;

            if (move.special === "castle_king") {
                text = "O-O";
            } else if (move.special === "castle_queen") {
                text = "O-O-O";
            } else if (move.special === "en_passant") {
                text += " e.p.";
            } else if (move.special === "promote_q") {
                text += "=♕";
            } else if (move.special === "split") {
                text = `⚛ ${pieceSymbol} split ${fromSquare}↔${toSquare}`;
            } else if (move.special === "recombine") {
                text = `⊕ ${pieceSymbol} recombine →${toSquare}`;
            }

            if (move.quantum_event && move.quantum_event.startsWith("flips_")) {
                text += ` coin×${move.quantum_event.split("_")[1]}`;
            }

            if (move.captured) {
                text += ` ×${DISPLAY_PIECES[move.captured] || move.captured}`;
            }

            return {
                move_number: Math.floor(index / 2) + 1,
                color: index % 2 === 0 ? "white" : "black",
                text,
            };
        });

        let pending = null;
        if (this.pendingCapture) {
            pending = {
                from: coordsToSquare(this.pendingCapture.from[0], this.pendingCapture.from[1]),
                to: coordsToSquare(this.pendingCapture.to[0], this.pendingCapture.to[1]),
                attacker_quantum: this.pendingCapture.attackerQuantum,
                defender_quantum: this.pendingCapture.defenderQuantum,
                attacker_piece: DISPLAY_PIECES[this.pendingCapture.moving] || "",
                defender_piece: this.pendingCapture.captured ? DISPLAY_PIECES[this.pendingCapture.captured] || "" : "",
            };
        }

        return {
            board: boardData,
            turn: this.turn,
            in_check: this.isInCheck(this.turn),
            is_checkmate: this.isCheckmate(),
            is_stalemate: this.isStalemate(),
            winner: this.winner,
            legal_moves: legalMoves,
            split_moves: splitMoves,
            quantum_pairs: quantumPairs,
            history,
            move_count: this.moveHistory.length,
            pending_quantum_capture: pending,
        };
    }
}