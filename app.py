"""
Quantum Chess — Flask Backend
Serves the web frontend and exposes the chess engine via JSON API.
"""

from flask import Flask, jsonify, request, send_from_directory
from chess_engine import Board

app = Flask(__name__, static_folder='static')

# Global game state
game = Board()

WEB_PIECES = {
    'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
}


def square_to_algebraic(row, col):
    return chr(ord('a') + col) + str(8 - row)


def algebraic_to_square(s):
    col = ord(s[0]) - ord('a')
    row = 8 - int(s[1])
    return (row, col)


def get_board_state():
    """Build a JSON-serializable board state including quantum info."""
    board_data = []
    for r in range(8):
        row = []
        for c in range(8):
            piece = game.board[r][c]
            pid = game.piece_ids[r][c]
            is_q = pid is not None and pid in game.quantum_halves
            partner_sq = None
            if is_q:
                ppos = game.get_partner_pos(r, c)
                if ppos:
                    partner_sq = square_to_algebraic(ppos[0], ppos[1])
            row.append({
                'piece': piece,
                'symbol': WEB_PIECES.get(piece, ''),
                'color': game._piece_color(piece),
                'square': square_to_algebraic(r, c),
                'piece_id': pid,
                'is_quantum': is_q,
                'partner_square': partner_sq,
            })
        board_data.append(row)

    # Legal moves
    legal_moves = {}
    if game.pending_capture is None:
        for fr, fc, tr, tc, special in game.generate_legal_moves():
            src = square_to_algebraic(fr, fc)
            dst = square_to_algebraic(tr, tc)
            legal_moves.setdefault(src, []).append({
                'target': dst,
                'special': special,
            })

    # Split moves for each piece of the current player
    split_moves = {}
    if game.pending_capture is None:
        for r in range(8):
            for c in range(8):
                piece = game.board[r][c]
                if piece is None:
                    continue
                if game._piece_color(piece) != game.turn:
                    continue
                pid = game.piece_ids[r][c]
                if pid in game.quantum_halves:
                    continue  # already quantum
                targets = game.generate_split_moves(r, c)
                if targets:
                    sq = square_to_algebraic(r, c)
                    split_moves[sq] = [square_to_algebraic(tr, tc)
                                       for tr, tc in targets]

    # Quantum pairs (for connection lines)
    quantum_pairs = []
    seen = set()
    for pid, partner_id in game.quantum_pairs.items():
        pair_key = tuple(sorted((pid, partner_id)))
        if pair_key in seen:
            continue
        seen.add(pair_key)
        # Find positions
        pos_a = pos_b = None
        for r in range(8):
            for c in range(8):
                if game.piece_ids[r][c] == pid:
                    pos_a = square_to_algebraic(r, c)
                elif game.piece_ids[r][c] == partner_id:
                    pos_b = square_to_algebraic(r, c)
        if pos_a and pos_b:
            quantum_pairs.append([pos_a, pos_b])

    # Build move history
    history = []
    for i, m in enumerate(game.move_history):
        fr, fc = m['from']
        tr, tc = m['to']
        piece_sym = WEB_PIECES.get(m['piece'], m['piece'])
        src = square_to_algebraic(fr, fc)
        dst = square_to_algebraic(tr, tc)
        entry = f"{piece_sym} {src}→{dst}"

        qe = m.get('quantum_event')
        if m['special'] == 'castle_king':
            entry = 'O-O'
        elif m['special'] == 'castle_queen':
            entry = 'O-O-O'
        elif m['special'] == 'en_passant':
            entry += ' e.p.'
        elif m['special'] == 'promote_q':
            entry += '=♛'
        elif m['special'] == 'split':
            entry = f'⚛ {piece_sym} split {src}↔{dst}'
        elif m['special'] == 'recombine':
            entry = f'⊕ {piece_sym} recombine →{dst}'

        if qe and qe.startswith('flips_'):
            num_flips = qe.split('_')[1]
            entry += f' 🪙x{num_flips}'

        if m['captured']:
            cap_sym = WEB_PIECES.get(m['captured'], m['captured'])
            entry += f' ×{cap_sym}'

        history.append({
            'move_number': (i // 2) + 1,
            'color': 'white' if i % 2 == 0 else 'black',
            'text': entry,
        })

    # Pending capture info
    pending = None
    if game.pending_capture:
        pc = game.pending_capture
        pending = {
            'from': square_to_algebraic(*pc['from']),
            'to': square_to_algebraic(*pc['to']),
            'attacker_quantum': pc['attacker_quantum'],
            'defender_quantum': pc['defender_quantum'],
            'attacker_piece': WEB_PIECES.get(pc['moving'], ''),
            'defender_piece': WEB_PIECES.get(pc['captured'], '') if pc['captured'] else '',
        }

    return {
        'board': board_data,
        'turn': game.turn,
        'in_check': game.is_in_check(game.turn),
        'is_checkmate': game.is_checkmate(),
        'is_stalemate': game.is_stalemate(),
        'winner': game.winner,
        'legal_moves': legal_moves,
        'split_moves': split_moves,
        'quantum_pairs': quantum_pairs,
        'history': history,
        'move_count': len(game.move_history),
        'pending_quantum_capture': pending,
    }


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/api/state')
def api_state():
    return jsonify(get_board_state())


@app.route('/api/move', methods=['POST'])
def api_move():
    data = request.get_json()
    if not data or 'from' not in data or 'to' not in data:
        return jsonify({'error': 'Missing from/to'}), 400

    try:
        from_sq = algebraic_to_square(data['from'])
        to_sq = algebraic_to_square(data['to'])
    except (IndexError, ValueError):
        return jsonify({'error': 'Invalid square notation'}), 400

    result = game.make_move(from_sq, to_sq)
    if result is False:
        return jsonify({'error': 'Illegal move'}), 400

    state = get_board_state()
    # If the result indicates a pending quantum capture, the state
    # will already include `pending_quantum_capture`
    return jsonify(state)


@app.route('/api/split', methods=['POST'])
def api_split():
    """Split a piece: {square: 'e2', target: 'e4'}"""
    data = request.get_json()
    if not data or 'square' not in data or 'target' not in data:
        return jsonify({'error': 'Missing square/target'}), 400

    try:
        r, c = algebraic_to_square(data['square'])
        tr, tc = algebraic_to_square(data['target'])
    except (IndexError, ValueError):
        return jsonify({'error': 'Invalid square notation'}), 400

    ok = game.split_piece(r, c, tr, tc)
    if not ok:
        return jsonify({'error': 'Cannot split here'}), 400

    return jsonify(get_board_state())


@app.route('/api/coin_flip', methods=['POST'])
def api_coin_flip():
    """Resolve a pending quantum capture with a coin flip."""
    if game.pending_capture is None:
        return jsonify({'error': 'No pending quantum capture'}), 400

    result = game.resolve_quantum_capture()
    state = get_board_state()
    state['coin_flip_result'] = result
    return jsonify(state)


@app.route('/api/reset', methods=['POST'])
def api_reset():
    global game
    game = Board()
    return jsonify(get_board_state())


if __name__ == '__main__':
    print('\n  ♛  QUANTUM CHESS  ♛')
    print('  ══════════════════')
    print('  Open http://localhost:5000 in your browser\n')
    import os
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(debug=debug, port=5000)
