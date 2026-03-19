"""
Chess Engine — Full legal move generation with castling, en passant,
check, checkmate, stalemate detection, AND quantum mechanics:
  - Piece splitting (any piece, including king)
  - Recombination (two halves on same square)
  - Coin-flip capture resolution for quantum pieces
"""

import random


class Board:
    """Represents an 8x8 chess board and all game state."""

    UNICODE_PIECES = {
        'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
        'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
    }

    def __init__(self):
        self.board = [[None] * 8 for _ in range(8)]
        self.turn = 'white'  # 'white' or 'black'
        self.en_passant_target = None  # (row, col) or None
        self.castling_rights = {
            'K': True,   # white kingside
            'Q': True,   # white queenside
            'k': True,   # black kingside
            'q': True,   # black queenside
        }
        self.move_history = []

        # ── Quantum state ──────────────────────────────────────
        self.piece_ids = [[None] * 8 for _ in range(8)]
        self.next_piece_id = 0
        self.quantum_pairs = {}    # {piece_id: partner_id} (bidirectional)
        self.quantum_halves = set()  # set of piece_ids that are quantum

        # Pending quantum capture (awaiting coin flip from frontend)
        self.pending_capture = None  # dict or None
        self.winner = None  # 'white', 'black', or None

        self._setup_initial_position()

    # ------------------------------------------------------------------ #
    #  Setup
    # ------------------------------------------------------------------ #

    def _assign_id(self, r, c):
        """Assign a unique ID to the piece at (r, c)."""
        pid = self.next_piece_id
        self.next_piece_id += 1
        self.piece_ids[r][c] = pid
        return pid

    def _setup_initial_position(self):
        back_rank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
        self.board[0] = list(back_rank)
        self.board[1] = ['p'] * 8
        self.board[6] = ['P'] * 8
        self.board[7] = [p.upper() for p in back_rank]

        # Assign IDs to all initial pieces
        for r in range(8):
            for c in range(8):
                if self.board[r][c] is not None:
                    self._assign_id(r, c)

    # ------------------------------------------------------------------ #
    #  Helpers
    # ------------------------------------------------------------------ #

    def _piece_color(self, piece):
        if piece is None:
            return None
        return 'white' if piece.isupper() else 'black'

    def _opponent(self, color):
        return 'black' if color == 'white' else 'white'

    def _in_bounds(self, r, c):
        return 0 <= r < 8 and 0 <= c < 8

    def _find_king(self, color):
        """Find king position(s). Returns first found."""
        king = 'K' if color == 'white' else 'k'
        for r in range(8):
            for c in range(8):
                if self.board[r][c] == king:
                    return (r, c)
        return None

    def _find_all_kings(self, color):
        """Find all king positions (may be split into two halves)."""
        king = 'K' if color == 'white' else 'k'
        positions = []
        for r in range(8):
            for c in range(8):
                if self.board[r][c] == king:
                    positions.append((r, c))
        return positions

    def is_quantum(self, r, c):
        """Check if piece at (r,c) is a quantum half."""
        pid = self.piece_ids[r][c]
        return pid is not None and pid in self.quantum_halves

    def get_partner_pos(self, r, c):
        """Get the position of the quantum partner of the piece at (r,c)."""
        pid = self.piece_ids[r][c]
        if pid is None or pid not in self.quantum_pairs:
            return None
        partner_id = self.quantum_pairs[pid]
        for pr in range(8):
            for pc in range(8):
                if self.piece_ids[pr][pc] == partner_id:
                    return (pr, pc)
        return None

    # ------------------------------------------------------------------ #
    #  Attack / check detection
    # ------------------------------------------------------------------ #

    def _is_square_attacked_by(self, r, c, attacker_color):
        for ar in range(8):
            for ac in range(8):
                piece = self.board[ar][ac]
                if piece is None or self._piece_color(piece) != attacker_color:
                    continue
                if self._can_piece_attack(ar, ac, r, c):
                    return True
        return False

    def _can_piece_attack(self, fr, fc, tr, tc):
        piece = self.board[fr][fc]
        if piece is None:
            return False
        ptype = piece.upper()
        dr = tr - fr
        dc = tc - fc

        if ptype == 'P':
            direction = -1 if piece.isupper() else 1
            return dr == direction and abs(dc) == 1
        if ptype == 'N':
            return (abs(dr), abs(dc)) in ((1, 2), (2, 1))
        if ptype == 'K':
            return max(abs(dr), abs(dc)) == 1
        if ptype == 'B':
            return self._attacks_diagonal(fr, fc, tr, tc)
        if ptype == 'R':
            return self._attacks_straight(fr, fc, tr, tc)
        if ptype == 'Q':
            return (self._attacks_diagonal(fr, fc, tr, tc) or
                    self._attacks_straight(fr, fc, tr, tc))
        return False

    def _attacks_straight(self, fr, fc, tr, tc):
        dr = tr - fr
        dc = tc - fc
        if dr != 0 and dc != 0:
            return False
        step_r = (1 if dr > 0 else -1) if dr != 0 else 0
        step_c = (1 if dc > 0 else -1) if dc != 0 else 0
        r, c = fr + step_r, fc + step_c
        while (r, c) != (tr, tc):
            if self.board[r][c] is not None:
                return False
            r += step_r
            c += step_c
        return True

    def _attacks_diagonal(self, fr, fc, tr, tc):
        dr = tr - fr
        dc = tc - fc
        if abs(dr) != abs(dc) or dr == 0:
            return False
        step_r = 1 if dr > 0 else -1
        step_c = 1 if dc > 0 else -1
        r, c = fr + step_r, fc + step_c
        while (r, c) != (tr, tc):
            if self.board[r][c] is not None:
                return False
            r += step_r
            c += step_c
        return True

    def is_in_check(self, color):
        """Is any of `color`'s king(s) currently in check? (Quantum kings ignore check)"""
        king_positions = self._find_all_kings(color)
        opp = self._opponent(color)
        for kr, kc in king_positions:
            pid = self.piece_ids[kr][kc]
            if pid in self.quantum_halves:
                continue  # Quantum kings are immune to check constraints
            if self._is_square_attacked_by(kr, kc, opp):
                return True
        return False

    # ------------------------------------------------------------------ #
    #  Pseudo-legal move generation
    # ------------------------------------------------------------------ #

    def _pseudo_legal_moves(self, color):
        for r in range(8):
            for c in range(8):
                piece = self.board[r][c]
                if piece is None or self._piece_color(piece) != color:
                    continue
                ptype = piece.upper()
                if ptype == 'P':
                    yield from self._pawn_moves(r, c, color)
                elif ptype == 'N':
                    yield from self._knight_moves(r, c, color)
                elif ptype == 'B':
                    yield from self._sliding_moves(r, c, color, diag=True, straight=False)
                elif ptype == 'R':
                    yield from self._sliding_moves(r, c, color, diag=False, straight=True)
                elif ptype == 'Q':
                    yield from self._sliding_moves(r, c, color, diag=True, straight=True)
                elif ptype == 'K':
                    yield from self._king_moves(r, c, color)

                # Quantum recombination: allow moving onto partner's square
                pid = self.piece_ids[r][c]
                if pid is not None and pid in self.quantum_halves:
                    yield from self._recombine_moves(r, c, color, ptype)

    def _pawn_moves(self, r, c, color):
        direction = -1 if color == 'white' else 1
        start_row = 6 if color == 'white' else 1
        promo_row = 0 if color == 'white' else 7

        nr = r + direction
        if self._in_bounds(nr, c) and self.board[nr][c] is None:
            if nr == promo_row:
                yield (r, c, nr, c, 'promote_q')
            else:
                yield (r, c, nr, c, None)
            if r == start_row:
                nr2 = r + 2 * direction
                if self.board[nr2][c] is None:
                    yield (r, c, nr2, c, None)

        for dc in (-1, 1):
            nc = c + dc
            if not self._in_bounds(nr, nc):
                continue
            target = self.board[nr][nc]
            if target is not None and self._piece_color(target) != color:
                if nr == promo_row:
                    yield (r, c, nr, nc, 'promote_q')
                else:
                    yield (r, c, nr, nc, None)
            if self.en_passant_target == (nr, nc):
                yield (r, c, nr, nc, 'en_passant')

    def _knight_moves(self, r, c, color):
        for dr, dc in ((-2, -1), (-2, 1), (-1, -2), (-1, 2),
                       (1, -2), (1, 2), (2, -1), (2, 1)):
            nr, nc = r + dr, c + dc
            if self._in_bounds(nr, nc):
                target = self.board[nr][nc]
                if target is None or self._piece_color(target) != color:
                    yield (r, c, nr, nc, None)

    def _sliding_moves(self, r, c, color, diag, straight):
        directions = []
        if straight:
            directions += [(0, 1), (0, -1), (1, 0), (-1, 0)]
        if diag:
            directions += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            while self._in_bounds(nr, nc):
                target = self.board[nr][nc]
                if target is None:
                    yield (r, c, nr, nc, None)
                elif self._piece_color(target) != color:
                    yield (r, c, nr, nc, None)
                    break
                else:
                    break
                nr += dr
                nc += dc

    def _king_moves(self, r, c, color):
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                nr, nc = r + dr, c + dc
                if self._in_bounds(nr, nc):
                    target = self.board[nr][nc]
                    if target is None or self._piece_color(target) != color:
                        yield (r, c, nr, nc, None)
        yield from self._castling_moves(r, c, color)

    def _castling_moves(self, r, c, color):
        opp = self._opponent(color)
        if self.is_in_check(color):
            return
        # Don't allow castling with quantum king
        pid = self.piece_ids[r][c]
        if pid is not None and pid in self.quantum_halves:
            return

        if color == 'white':
            if self.castling_rights['K']:
                if (self.board[7][5] is None and
                    self.board[7][6] is None and
                    not self._is_square_attacked_by(7, 5, opp) and
                    not self._is_square_attacked_by(7, 6, opp)):
                    yield (7, 4, 7, 6, 'castle_king')
            if self.castling_rights['Q']:
                if (self.board[7][3] is None and
                    self.board[7][2] is None and
                    self.board[7][1] is None and
                    not self._is_square_attacked_by(7, 3, opp) and
                    not self._is_square_attacked_by(7, 2, opp)):
                    yield (7, 4, 7, 2, 'castle_queen')
        else:
            if self.castling_rights['k']:
                if (self.board[0][5] is None and
                    self.board[0][6] is None and
                    not self._is_square_attacked_by(0, 5, opp) and
                    not self._is_square_attacked_by(0, 6, opp)):
                    yield (0, 4, 0, 6, 'castle_king')
            if self.castling_rights['q']:
                if (self.board[0][3] is None and
                    self.board[0][2] is None and
                    self.board[0][1] is None and
                    not self._is_square_attacked_by(0, 3, opp) and
                    not self._is_square_attacked_by(0, 2, opp)):
                    yield (0, 4, 0, 2, 'castle_queen')

    def _recombine_moves(self, r, c, color, ptype):
        """Generate recombination moves: a quantum half can move to its partner's
        square using the piece's normal movement rules."""
        pid = self.piece_ids[r][c]
        if pid not in self.quantum_pairs:
            return
        partner_id = self.quantum_pairs[pid]
        partner_pos = None
        for pr in range(8):
            for pc in range(8):
                if self.piece_ids[pr][pc] == partner_id:
                    partner_pos = (pr, pc)
                    break
            if partner_pos:
                break
        if partner_pos is None:
            return

        tr, tc = partner_pos
        dr = tr - r
        dc = tc - c

        can_reach = False
        if ptype == 'N':
            can_reach = (abs(dr), abs(dc)) in ((1, 2), (2, 1))
        elif ptype == 'K':
            can_reach = max(abs(dr), abs(dc)) == 1
        elif ptype == 'B':
            can_reach = self._attacks_diagonal(r, c, tr, tc)
        elif ptype == 'R':
            can_reach = self._attacks_straight(r, c, tr, tc)
        elif ptype == 'Q':
            can_reach = (self._attacks_diagonal(r, c, tr, tc) or
                         self._attacks_straight(r, c, tr, tc))
        elif ptype == 'P':
            # Pawns can recombine by single push (forward to partner)
            direction = -1 if color == 'white' else 1
            if dc == 0 and dr == direction:
                can_reach = True
            # Or double push from start row
            start_row = 6 if color == 'white' else 1
            if dc == 0 and dr == 2 * direction and r == start_row:
                mid_r = r + direction
                if self.board[mid_r][c] is None:
                    can_reach = True

        if can_reach:
            yield (r, c, tr, tc, 'recombine')

    # ------------------------------------------------------------------ #
    #  Legal move generation
    # ------------------------------------------------------------------ #

    def generate_legal_moves(self):
        """Return list of (fr, fc, tr, tc, special) that are fully legal."""
        legal = []
        for move in self._pseudo_legal_moves(self.turn):
            if self._is_move_legal(move):
                legal.append(move)
        return legal

    def _is_move_legal(self, move):
        """Try the move on a copy and check if own king is safe."""
        fr, fc, tr, tc, special = move
        captured = self.board[tr][tc]
        moving = self.board[fr][fc]
        moving_id = self.piece_ids[fr][fc]
        captured_id = self.piece_ids[tr][tc]
        ep_captured_piece = None
        ep_captured_id = None
        ep_pos = None

        # Recombine: just remove the mover, partner stays
        if special == 'recombine':
            self.board[fr][fc] = None
            self.piece_ids[fr][fc] = None
            in_check = self.is_in_check(self.turn)
            self.board[fr][fc] = moving
            self.piece_ids[fr][fc] = moving_id
            return not in_check

        # Execute on board
        self.board[tr][tc] = moving
        self.board[fr][fc] = None
        self.piece_ids[tr][tc] = moving_id
        self.piece_ids[fr][fc] = None

        if special == 'en_passant':
            direction = -1 if self.turn == 'white' else 1
            ep_pos = (tr - direction, tc)
            ep_captured_piece = self.board[ep_pos[0]][ep_pos[1]]
            ep_captured_id = self.piece_ids[ep_pos[0]][ep_pos[1]]
            self.board[ep_pos[0]][ep_pos[1]] = None
            self.piece_ids[ep_pos[0]][ep_pos[1]] = None

        if special == 'promote_q':
            self.board[tr][tc] = 'Q' if self.turn == 'white' else 'q'

        if special == 'castle_king':
            rook_row = 7 if self.turn == 'white' else 0
            rook_id = self.piece_ids[rook_row][7]
            self.board[rook_row][5] = self.board[rook_row][7]
            self.piece_ids[rook_row][5] = rook_id
            self.board[rook_row][7] = None
            self.piece_ids[rook_row][7] = None

        if special == 'castle_queen':
            rook_row = 7 if self.turn == 'white' else 0
            rook_id = self.piece_ids[rook_row][0]
            self.board[rook_row][3] = self.board[rook_row][0]
            self.piece_ids[rook_row][3] = rook_id
            self.board[rook_row][0] = None
            self.piece_ids[rook_row][0] = None

        in_check = self.is_in_check(self.turn)

        # Undo
        self.board[fr][fc] = moving
        self.piece_ids[fr][fc] = moving_id
        self.board[tr][tc] = captured
        self.piece_ids[tr][tc] = captured_id

        if special == 'en_passant' and ep_pos:
            self.board[ep_pos[0]][ep_pos[1]] = ep_captured_piece
            self.piece_ids[ep_pos[0]][ep_pos[1]] = ep_captured_id

        if special == 'promote_q':
            self.board[fr][fc] = 'P' if self.turn == 'white' else 'p'

        if special == 'castle_king':
            rook_row = 7 if self.turn == 'white' else 0
            self.board[rook_row][7] = self.board[rook_row][5]
            self.piece_ids[rook_row][7] = self.piece_ids[rook_row][5]
            self.board[rook_row][5] = None
            self.piece_ids[rook_row][5] = None

        if special == 'castle_queen':
            rook_row = 7 if self.turn == 'white' else 0
            self.board[rook_row][0] = self.board[rook_row][3]
            self.piece_ids[rook_row][0] = self.piece_ids[rook_row][3]
            self.board[rook_row][3] = None
            self.piece_ids[rook_row][3] = None

        return not in_check

    # ------------------------------------------------------------------ #
    #  Check if a move involves a quantum piece (capture scenario)
    # ------------------------------------------------------------------ #

    def _involves_quantum(self, fr, fc, tr, tc):
        """Check if a normal move involves a quantum piece in a capture."""
        target = self.board[tr][tc]
        attacker_id = self.piece_ids[fr][fc]
        defender_id = self.piece_ids[tr][tc]

        attacker_quantum = attacker_id in self.quantum_halves
        defender_quantum = (target is not None and
                           self._piece_color(target) != self._piece_color(self.board[fr][fc]) and
                           defender_id in self.quantum_halves)

        # Also check en passant target
        return attacker_quantum or defender_quantum

    # ------------------------------------------------------------------ #
    #  Make move
    # ------------------------------------------------------------------ #

    def make_move(self, from_sq, to_sq):
        """Execute a move. Returns dict with result info, or False if illegal.

        If the move involves a quantum capture, sets self.pending_capture
        and returns {'quantum_capture_pending': True, ...} instead of
        executing the capture immediately.
        """
        fr, fc = from_sq
        tr, tc = to_sq

        legal_moves = self.generate_legal_moves()
        matching = [m for m in legal_moves
                    if m[0] == fr and m[1] == fc and m[2] == tr and m[3] == tc]

        if not matching:
            return False

        move = matching[0]
        _, _, _, _, special = move

        captured = self.board[tr][tc]
        moving = self.board[fr][fc]
        moving_id = self.piece_ids[fr][fc]
        captured_id = self.piece_ids[tr][tc]

        # Check if this is a capture involving quantum pieces
        is_capture = (captured is not None and
                      self._piece_color(captured) != self._piece_color(moving))

        # Also check en passant
        ep_is_quantum = False
        if special == 'en_passant':
            direction = -1 if self.turn == 'white' else 1
            ep_r, ep_c = tr - direction, tc
            ep_id = self.piece_ids[ep_r][ep_c]
            ep_is_quantum = ep_id in self.quantum_halves
            is_capture = True

        attacker_quantum = moving_id in self.quantum_halves
        defender_quantum = (captured_id is not None and
                           captured_id in self.quantum_halves) if is_capture else False
        if special == 'en_passant':
            defender_quantum = ep_is_quantum

        if is_capture and (attacker_quantum or defender_quantum):
            # Set up pending quantum capture - don't execute yet
            self.pending_capture = {
                'from': (fr, fc),
                'to': (tr, tc),
                'special': special,
                'moving': moving,
                'moving_id': moving_id,
                'captured': captured,
                'captured_id': captured_id,
                'attacker_quantum': attacker_quantum,
                'defender_quantum': defender_quantum,
            }
            return {'quantum_capture_pending': True}

        # Check for recombination: moving a quantum half to its partner's square
        if (moving_id in self.quantum_halves and
            captured is not None and
            self._piece_color(captured) == self._piece_color(moving)):
            partner_id = self.quantum_pairs.get(moving_id)
            if partner_id == captured_id:
                return self._recombine_move(fr, fc, tr, tc, moving, moving_id,
                                            captured_id)

        # Normal move execution
        return self._execute_normal_move(fr, fc, tr, tc, special, moving,
                                         moving_id, captured, captured_id)

    def _execute_normal_move(self, fr, fc, tr, tc, special, moving,
                              moving_id, captured, captured_id):
        """Execute a standard (non-quantum-capture) move."""

        self.move_history.append({
            'from': (fr, fc),
            'to': (tr, tc),
            'piece': moving,
            'captured': captured,
            'special': special,
            'en_passant_target': self.en_passant_target,
            'castling_rights': dict(self.castling_rights),
            'quantum_event': None,
        })

        # Execute
        self.board[tr][tc] = moving
        self.board[fr][fc] = None
        self.piece_ids[tr][tc] = moving_id
        self.piece_ids[fr][fc] = None

        if special == 'en_passant':
            direction = -1 if self.turn == 'white' else 1
            ep_r = tr - direction
            self.board[ep_r][tc] = None
            self.piece_ids[ep_r][tc] = None

        if special == 'promote_q':
            self.board[tr][tc] = 'Q' if self.turn == 'white' else 'q'

        if special == 'castle_king':
            rook_row = 7 if self.turn == 'white' else 0
            rook_id = self.piece_ids[rook_row][7]
            self.board[rook_row][5] = self.board[rook_row][7]
            self.piece_ids[rook_row][5] = rook_id
            self.board[rook_row][7] = None
            self.piece_ids[rook_row][7] = None

        if special == 'castle_queen':
            rook_row = 7 if self.turn == 'white' else 0
            rook_id = self.piece_ids[rook_row][0]
            self.board[rook_row][3] = self.board[rook_row][0]
            self.piece_ids[rook_row][3] = rook_id
            self.board[rook_row][0] = None
            self.piece_ids[rook_row][0] = None

        # Update en passant target
        self.en_passant_target = None
        if moving and moving.upper() == 'P' and abs(tr - fr) == 2:
            self.en_passant_target = ((fr + tr) // 2, fc)

        self._update_castling_rights(fr, fc, tr, tc, moving, captured)
        self.turn = self._opponent(self.turn)
        return True

    def _recombine_move(self, fr, fc, tr, tc, moving, moving_id, captured_id):
        """Move a quantum half onto its partner to recombine into a full piece."""
        self.move_history.append({
            'from': (fr, fc),
            'to': (tr, tc),
            'piece': moving,
            'captured': None,
            'special': 'recombine',
            'en_passant_target': self.en_passant_target,
            'castling_rights': dict(self.castling_rights),
            'quantum_event': 'recombine',
        })

        # Remove the moving half from its origin
        self.board[fr][fc] = None
        self.piece_ids[fr][fc] = None

        # The partner on the target square becomes a full piece
        # Remove both from quantum tracking
        self.quantum_halves.discard(moving_id)
        self.quantum_halves.discard(captured_id)
        if moving_id in self.quantum_pairs:
            del self.quantum_pairs[moving_id]
        if captured_id in self.quantum_pairs:
            del self.quantum_pairs[captured_id]

        self.en_passant_target = None
        self.turn = self._opponent(self.turn)
        return True

    def _update_castling_rights(self, fr, fc, tr, tc, moving, captured):
        if moving == 'K':
            self.castling_rights['K'] = False
            self.castling_rights['Q'] = False
        elif moving == 'k':
            self.castling_rights['k'] = False
            self.castling_rights['q'] = False

        if moving == 'R':
            if (fr, fc) == (7, 7):
                self.castling_rights['K'] = False
            elif (fr, fc) == (7, 0):
                self.castling_rights['Q'] = False
        elif moving == 'r':
            if (fr, fc) == (0, 7):
                self.castling_rights['k'] = False
            elif (fr, fc) == (0, 0):
                self.castling_rights['q'] = False

        if (tr, tc) == (7, 7):
            self.castling_rights['K'] = False
        elif (tr, tc) == (7, 0):
            self.castling_rights['Q'] = False
        elif (tr, tc) == (0, 7):
            self.castling_rights['k'] = False
        elif (tr, tc) == (0, 0):
            self.castling_rights['q'] = False

    # ------------------------------------------------------------------ #
    #  Quantum: Splitting
    # ------------------------------------------------------------------ #

    def generate_split_moves(self, r, c):
        """Return list of (tr, tc) — valid targets for the moving half
        after a split. Same as the piece's normal moves, but only to
        empty squares (no captures during split)."""
        piece = self.board[r][c]
        if piece is None:
            return []
        pid = self.piece_ids[r][c]
        # Already quantum? Can't split again
        if pid in self.quantum_halves:
            return []

        color = self._piece_color(piece)
        if color != self.turn:
            return []

        targets = []
        ptype = piece.upper()
        if ptype == 'P':
            moves = list(self._pawn_moves(r, c, color))
        elif ptype == 'N':
            moves = list(self._knight_moves(r, c, color))
        elif ptype == 'B':
            moves = list(self._sliding_moves(r, c, color, diag=True, straight=False))
        elif ptype == 'R':
            moves = list(self._sliding_moves(r, c, color, diag=False, straight=True))
        elif ptype == 'Q':
            moves = list(self._sliding_moves(r, c, color, diag=True, straight=True))
        elif ptype == 'K':
            # King split: normal king moves only (no castling)
            moves = []
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    if dr == 0 and dc == 0:
                        continue
                    nr, nc = r + dr, c + dc
                    if self._in_bounds(nr, nc):
                        target = self.board[nr][nc]
                        if target is None or self._piece_color(target) != color:
                            moves.append((r, c, nr, nc, None))
        else:
            moves = []

        # Filter to empty squares only (no captures during split) and check legality
        for move in moves:
            _, _, tr, tc, special = move
            if special in ('castle_king', 'castle_queen', 'en_passant', 'promote_q'):
                continue
            if self.board[tr][tc] is not None:
                continue
            # Check that the split doesn't leave king in check
            # Temporarily place the half
            self.board[tr][tc] = piece
            new_id = self.next_piece_id  # temporary
            self.piece_ids[tr][tc] = new_id

            is_king = piece.upper() == 'K'
            if is_king:
                self.quantum_halves.add(pid)
                self.quantum_halves.add(new_id)

            in_check = self.is_in_check(color)

            if is_king:
                self.quantum_halves.discard(pid)
                self.quantum_halves.discard(new_id)

            self.board[tr][tc] = None
            self.piece_ids[tr][tc] = None
            if not in_check:
                targets.append((tr, tc))

        return targets

    def split_piece(self, r, c, tr, tc):
        """Split the piece at (r,c). Original half stays, new half goes to (tr,tc).
        Returns True on success."""
        piece = self.board[r][c]
        if piece is None:
            return False

        pid = self.piece_ids[r][c]
        if pid in self.quantum_halves:
            return False  # already quantum

        color = self._piece_color(piece)
        if color != self.turn:
            return False

        valid_targets = self.generate_split_moves(r, c)
        if (tr, tc) not in valid_targets:
            return False

        # Create the new half
        new_id = self.next_piece_id
        self.next_piece_id += 1

        # Place the new half
        self.board[tr][tc] = piece
        self.piece_ids[tr][tc] = new_id

        # Mark both as quantum
        self.quantum_halves.add(pid)
        self.quantum_halves.add(new_id)
        self.quantum_pairs[pid] = new_id
        self.quantum_pairs[new_id] = pid

        # Record in history
        self.move_history.append({
            'from': (r, c),
            'to': (tr, tc),
            'piece': piece,
            'captured': None,
            'special': 'split',
            'en_passant_target': self.en_passant_target,
            'castling_rights': dict(self.castling_rights),
            'quantum_event': 'split',
        })

        self.en_passant_target = None
        self.turn = self._opponent(self.turn)
        return True

    # ------------------------------------------------------------------ #
    #  Quantum: Coin flip capture resolution
    # ------------------------------------------------------------------ #

    def resolve_quantum_capture(self):
        """Resolve a pending quantum capture with up to two coin flips.
        Returns a dict describing what happened, or None if no pending capture.
        """
        if self.pending_capture is None:
            return None

        pc = self.pending_capture
        fr, fc = pc['from']
        tr, tc = pc['to']
        special = pc['special']
        moving = pc['moving']
        moving_id = pc['moving_id']
        captured = pc['captured']
        captured_id = pc['captured_id']
        attacker_quantum = pc['attacker_quantum']
        defender_quantum = pc['defender_quantum']

        flips = []
        result = {'flips': flips, 'events': [], 'capture_succeeded': False, 'recombined_at': None}

        attacker_real = True
        if attacker_quantum:
            coin = random.choice(['heads', 'tails'])
            flips.append({'actor': 'attacker', 'coin': coin})
            if coin == 'tails':
                attacker_real = False
                result['events'].append('attacker_fake')
                partner_pos = self.get_partner_pos(fr, fc)
                self._recombine_vanish(moving_id)
                self.board[fr][fc] = None
                self.piece_ids[fr][fc] = None
                result['recombined_at'] = partner_pos
            else:
                result['events'].append('attacker_real')

        if attacker_real:
            defender_real = True
            if defender_quantum:
                coin = random.choice(['heads', 'tails'])
                flips.append({'actor': 'defender', 'coin': coin})
                if coin == 'tails':
                    defender_real = False
                    result['events'].append('defender_fake')
                    partner_pos = self.get_partner_pos(tr, tc)
                    self._recombine_vanish(captured_id)
                    # Defender fake, so attacker just takes the empty square
                    self.board[tr][tc] = moving
                    self.piece_ids[tr][tc] = moving_id
                    self.board[fr][fc] = None
                    self.piece_ids[fr][fc] = None
                    result['capture_succeeded'] = False
                    result['recombined_at'] = partner_pos
                    # En passant
                    if special == 'en_passant':
                        direction = -1 if self.turn == 'white' else 1
                        ep_r = tr - direction
                        ep_id = self.piece_ids[ep_r][tc]
                        if ep_id and ep_id in self.quantum_halves:
                            ep_partner_pos = self.get_partner_pos(ep_r, tc)
                            self._recombine_vanish(ep_id)
                            self.board[ep_r][tc] = None
                            self.piece_ids[ep_r][tc] = None
                else:
                    result['events'].append('defender_real')

            if defender_real:
                # Capture succeeds
                if defender_quantum:
                    self._remove_quantum_pair(captured_id, tr, tc, special)
                
                self.board[tr][tc] = moving
                self.piece_ids[tr][tc] = moving_id
                self.board[fr][fc] = None
                self.piece_ids[fr][fc] = None
                result['capture_succeeded'] = True

                if special == 'en_passant':
                    direction = -1 if self.turn == 'white' else 1
                    ep_r = tr - direction
                    ep_id = self.piece_ids[ep_r][tc]
                    if defender_quantum:
                        self._remove_quantum_pair(ep_id, ep_r, tc, special)
                    self.board[ep_r][tc] = None
                    self.piece_ids[ep_r][tc] = None

        self._check_for_winner()

        # Record history
        self.move_history.append({
            'from': (fr, fc),
            'to': (tr, tc),
            'piece': moving,
            'captured': captured if result.get('capture_succeeded') else None,
            'special': special,
            'en_passant_target': self.en_passant_target,
            'castling_rights': dict(self.castling_rights),
            'quantum_event': f"flips_{len(flips)}",
        })

        self.en_passant_target = None
        if moving and moving.upper() == 'P' and abs(tr - fr) == 2:
            self.en_passant_target = ((fr + tr) // 2, fc)

        self._update_castling_rights(fr, fc, tr, tc, moving, captured)
        self.turn = self._opponent(self.turn)
        self.pending_capture = None

        return result

    def _remove_quantum_pair(self, piece_id, r, c, special=None):
        """Remove both halves of a quantum pair from the board."""
        if piece_id not in self.quantum_pairs:
            return
        partner_id = self.quantum_pairs[piece_id]

        # Find and remove the partner
        for pr in range(8):
            for pc in range(8):
                if self.piece_ids[pr][pc] == partner_id:
                    self.board[pr][pc] = None
                    self.piece_ids[pr][pc] = None
                    break

        # Clean up quantum state
        self.quantum_halves.discard(piece_id)
        self.quantum_halves.discard(partner_id)
        if piece_id in self.quantum_pairs:
            del self.quantum_pairs[piece_id]
        if partner_id in self.quantum_pairs:
            del self.quantum_pairs[partner_id]

    def _recombine_vanish(self, piece_id):
        """A quantum half was determined to be 'not real'.
        Remove it and make its partner a full (non-quantum) piece."""
        if piece_id not in self.quantum_pairs:
            return
        partner_id = self.quantum_pairs[piece_id]

        # Remove quantum tracking for both
        self.quantum_halves.discard(piece_id)
        self.quantum_halves.discard(partner_id)
        if piece_id in self.quantum_pairs:
            del self.quantum_pairs[piece_id]
        if partner_id in self.quantum_pairs:
            del self.quantum_pairs[partner_id]
        # Partner remains on the board as a full piece — nothing else needed

    def _check_for_winner(self):
        """Scans the board and checks if either color is missing its king(s), ending the game."""
        white_kings = self._find_all_kings('white')
        black_kings = self._find_all_kings('black')
        if not white_kings:
            self.winner = 'black'
        elif not black_kings:
            self.winner = 'white'

    def cancel_pending_capture(self):
        """Cancel a pending quantum capture (e.g. on reset)."""
        self.pending_capture = None

    # ------------------------------------------------------------------ #
    #  Game-over detection
    # ------------------------------------------------------------------ #

    def is_checkmate(self):
        if self.pending_capture is not None:
            return False
        return len(self.generate_legal_moves()) == 0 and self.is_in_check(self.turn)

    def is_stalemate(self):
        if self.pending_capture is not None:
            return False
        return len(self.generate_legal_moves()) == 0 and not self.is_in_check(self.turn)

    # ------------------------------------------------------------------ #
    #  Display (terminal)
    # ------------------------------------------------------------------ #

    def display(self):
        lines = []
        lines.append('')
        lines.append('    a   b   c   d   e   f   g   h')
        lines.append('  ┌───┬───┬───┬───┬───┬───┬───┬───┐')
        for r in range(8):
            rank_num = 8 - r
            row_cells = []
            for c in range(8):
                piece = self.board[r][c]
                if piece is None:
                    if (r + c) % 2 == 0:
                        row_cells.append(' · ')
                    else:
                        row_cells.append('   ')
                else:
                    sym = self.UNICODE_PIECES.get(piece, piece)
                    pid = self.piece_ids[r][c]
                    if pid in self.quantum_halves:
                        sym = f'½{sym}'
                        row_cells.append(f'{sym} ')
                    else:
                        row_cells.append(f' {sym} ')
            line = f'{rank_num} │{"│".join(row_cells)}│ {rank_num}'
            lines.append(line)
            if r < 7:
                lines.append('  ├───┼───┼───┼───┼───┼───┼───┼───┤')
        lines.append('  └───┴───┴───┴───┴───┴───┴───┴───┘')
        lines.append('    a   b   c   d   e   f   g   h')
        lines.append('')
        return '\n'.join(lines)
