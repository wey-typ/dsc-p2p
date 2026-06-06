import type { Card, Trick } from "./types.js";
import type { TaskState } from "./tasks.js";
import { type GameState, type GamePhase, legalMovesFor } from "./game.js";
import { sortHand } from "./cards.js";

/** Public info about a seat (no private hand contents). */
export interface PublicPlayer {
  readonly seat: number;
  readonly id: string;
  readonly name: string;
  readonly isBot: boolean;
}

/**
 * What a single seat is allowed to see. Other players' hand *contents* are never
 * included — only their counts. This is the payload the server sends each client.
 */
export interface PlayerView {
  readonly youSeat: number;
  readonly phase: GamePhase;
  readonly failReason?: string;
  readonly turn: number;
  readonly commander: number;
  readonly trickNumber: number;
  readonly completedCount: number;
  readonly taskTotal: number;
  readonly players: PublicPlayer[];
  /** Card count in each seat's hand, indexed by seat. */
  readonly handCounts: number[];
  /** Your own hand, sorted for display. */
  readonly hand: Card[];
  /** Cards you may legally play right now (empty if not your turn). */
  readonly legalMoves: Card[];
  readonly trick: Trick;
  /** Tasks are public to the whole crew. */
  readonly tasks: TaskState[];
}

/** Project the full game state down to what `seat` is allowed to see. */
export function projectForSeat(state: GameState, seat: number): PlayerView {
  return {
    youSeat: seat,
    phase: state.phase,
    failReason: state.failReason,
    turn: state.turn,
    commander: state.commander,
    trickNumber: state.trickNumber,
    completedCount: state.completedCount,
    taskTotal: state.tasks.length,
    players: state.players.map((p, i) => ({
      seat: i,
      id: p.id,
      name: p.name,
      isBot: p.isBot,
    })),
    handCounts: state.hands.map((h) => h.length),
    hand: sortHand(state.hands[seat] ?? []),
    legalMoves: legalMovesFor(state, seat),
    trick: state.trick,
    tasks: state.tasks,
  };
}
