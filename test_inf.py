import sys
from chess_engine import Board

print("--- Test 1: Quantum King Immunity to Check ---")
b1 = Board()
# Clear board
for r in range(8):
    for c in range(8):
        b1.board[r][c] = None
        b1.piece_ids[r][c] = None
b1.turn = 'white'

# Place White King and Black Queen
b1.board[7][4] = 'K'; b1.piece_ids[7][4] = 1
b1.board[0][4] = 'q'; b1.piece_ids[0][4] = 2
b1.board[0][0] = 'k'; b1.piece_ids[0][0] = 3

# King is in check normally
assert b1.is_in_check('white') == True, "Normal king should be in check"

# Split the king
targets = b1.generate_split_moves(7, 4)
assert len(targets) > 0
tr, tc = targets[0]
b1.split_piece(7, 4, tr, tc)

# King is no longer in check!
assert b1.is_in_check('white') == False, "Quantum king should be immune to check"

# Try to move the white king half INTO check
# White king on e1 is quantum. Black Queen is on e8.
# Move king to f1 (if it's e1).
# Actually just try to generate legal moves. It should include moving along the e-file into the queen's path, or staying.
legal_moves = b1.generate_legal_moves()
print(f"White quantum king has {len(legal_moves)} legal moves.")
assert len(legal_moves) > 0

# Test 2: King Capture ends game
print("\n--- Test 2: King Capture End Game ---")
b1.turn = 'black'
# Black Queen attacks White Quantum King at 7,4
# Is capturing the king a pseudo legal move?
p_moves = list(b1._pseudo_legal_moves('black'))
capture_move = [m for m in p_moves if m[0] == 0 and m[1] == 4 and m[2] == 7 and m[3] == 4]
assert len(capture_move) > 0, "Black Queen should have pseudo legal move to capture White King half"

# Since quantum king means white is not in check, black's capture move is LEGAL
l_moves = b1.generate_legal_moves()
legal_capture = [m for m in l_moves if m[0] == 0 and m[1] == 4 and m[2] == 7 and m[3] == 4]
assert len(legal_capture) > 0, "Capturing quantum king must be a legal move"

# Make the capture move
res = b1.make_move((0,4), (7,4))
assert res.get('quantum_capture_pending') == True
assert b1.pending_capture['captured'] == 'K'
assert b1.pending_capture['defender_quantum'] == True

# Resolve capture until we get Heads (king dies) -> game over
resolved = False
for _ in range(20):
    b1.pending_capture = {
        'from': (0,4), 'to': (7,4), 'special': None, 'moving': 'q', 'moving_id': 2,
        'captured': 'K', 'captured_id': 1, 'attacker_quantum': False, 'defender_quantum': True
    }
    r = b1.resolve_quantum_capture()
    if r['capture_succeeded']:
        assert b1.winner == 'black', "Black should win if White King is captured"
        resolved = True
        break
assert resolved, "Should eventually roll heads and win the game"

# Test 3: Double Coin Flip
print("\n--- Test 3: Quantum vs Quantum Capture ---")
b3 = Board()
for r in range(8):
    for c in range(8):
        b3.board[r][c] = None
        b3.piece_ids[r][c] = None
b3.turn = 'white'
b3.board[7][4] = 'K'; b3.piece_ids[7][4] = 10
b3.board[0][0] = 'k'; b3.piece_ids[0][0] = 11

b3.board[4][4] = 'R'; b3.piece_ids[4][4] = 12 # White Rook e4
b3.board[4][0] = 'r'; b3.piece_ids[4][0] = 13 # Black Rook a4

# Quantumize both
b3.split_piece(4, 4, 3, 4) # e4 and d4
b3.turn = 'black'
b3.split_piece(4, 0, 3, 0) # a4 and a5
b3.turn = 'white'

# White Rook on e4 attacks Black Rook on a4
res = b3.make_move((4,4), (4,0))
assert res.get('quantum_capture_pending') == True
pc = b3.pending_capture
assert pc['attacker_quantum'] == True
assert pc['defender_quantum'] == True

r = b3.resolve_quantum_capture()
assert 'flips' in r
flips = r['flips']
assert len(flips) in (1, 2)
if flips[0]['coin'] == 'tails':
    assert len(flips) == 1
    assert not r['capture_succeeded']
else:
    assert len(flips) == 2
    if flips[1]['coin'] == 'heads':
        assert r['capture_succeeded']
    else:
        assert not r['capture_succeeded']

print("All advanced mechanics tests PASS!")
