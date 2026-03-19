#!/usr/bin/env python3
"""
Quantum Chess — Terminal UI
Play a full game of chess in the terminal with legal move enforcement.
"""

import sys
from chess_engine import Board


def parse_square(s):
    """Convert algebraic notation like 'e2' to (row, col)."""
    s = s.strip().lower()
    if len(s) != 2:
        return None
    col = ord(s[0]) - ord('a')
    row = 8 - int(s[1])
    if 0 <= row < 8 and 0 <= col < 8:
        return (row, col)
    return None


def square_name(row, col):
    """Convert (row, col) to algebraic notation like 'e2'."""
    return chr(ord('a') + col) + str(8 - row)


def main():
    board = Board()
    print('\n  ♛  QUANTUM CHESS  ♛')
    print('  ══════════════════')
    print('  Enter moves as: e2 e4')
    print('  Type "quit" to exit\n')

    while True:
        print(board.display())

        # Game-over checks
        if board.is_checkmate():
            winner = 'Black' if board.turn == 'white' else 'White'
            print(f'  ✦ CHECKMATE! {winner} wins! ✦\n')
            break

        if board.is_stalemate():
            print('  ✦ STALEMATE! The game is a draw. ✦\n')
            break

        # Check announcement
        if board.is_in_check(board.turn):
            color_name = board.turn.capitalize()
            print(f'  ⚠  {color_name} is in CHECK!\n')

        # Prompt
        turn_label = '♔ White' if board.turn == 'white' else '♚ Black'
        try:
            user_input = input(f'  {turn_label} to move: ').strip()
        except (EOFError, KeyboardInterrupt):
            print('\n  Game ended.\n')
            break

        if user_input.lower() == 'quit':
            print('\n  Game ended.\n')
            break

        parts = user_input.split()
        if len(parts) != 2:
            print('  ✗ Invalid format. Use: e2 e4\n')
            continue

        from_sq = parse_square(parts[0])
        to_sq = parse_square(parts[1])

        if from_sq is None or to_sq is None:
            print('  ✗ Invalid square. Use a-h and 1-8 (e.g. e2 e4)\n')
            continue

        # Check the player is moving their own piece
        piece = board.board[from_sq[0]][from_sq[1]]
        if piece is None:
            print(f'  ✗ No piece on {parts[0]}.\n')
            continue
        if board._piece_color(piece) != board.turn:
            print(f'  ✗ That\'s not your piece!\n')
            continue

        if not board.make_move(from_sq, to_sq):
            print(f'  ✗ Illegal move: {parts[0]} → {parts[1]}\n')
            continue

        # Report the move
        last = board.move_history[-1]
        label = Board.UNICODE_PIECES.get(last['piece'], last['piece'])
        move_desc = f'{label} {parts[0]} → {parts[1]}'
        if last['special'] == 'castle_king':
            move_desc += '  (O-O)'
        elif last['special'] == 'castle_queen':
            move_desc += '  (O-O-O)'
        elif last['special'] == 'en_passant':
            move_desc += '  (en passant)'
        elif last['special'] == 'promote_q':
            promo = '♕' if last['piece'] == 'P' else '♛'
            move_desc += f'  (promoted to {promo})'
        if last['captured']:
            cap_sym = Board.UNICODE_PIECES.get(last['captured'], last['captured'])
            move_desc += f'  captures {cap_sym}'
        print(f'  → {move_desc}\n')


if __name__ == '__main__':
    main()
