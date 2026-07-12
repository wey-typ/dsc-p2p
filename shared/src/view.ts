import type { Card, Trick } from "./types.js";
import type { TaskState } from "./tasks.js";
import {
  type GameState,
  type GamePhase,
  type Communication,
  type CommsMode,
  type MissionModifier,
  legalMovesFor,
  canCommunicate,
  canStartDistress,
  communicateBlockedReason,
  isUndertowTrick,
} from "./game.js";
import { sortHand } from "./cards.js";

/** What a seat sees of a pending distress signal. */
export interface DistressView {
  readonly direction: "left" | "right";
  /** Whether YOU have already chosen a card to pass. */
  readonly youPicked: boolean;
  /** Seats the crew is still waiting on. */
  readonly waitingSeats: number[];
}

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
  /** Capture-task completions (feeds the ①②③ ordering badges). */
  readonly completedCount: number;
  /** Tasks of ANY kind marked done (what the header progress shows). */
  readonly doneCount: number;
  readonly taskTotal: number;
  /** Tricks won per seat (public — everyone sees the piles). */
  readonly tricksWon: number[];
  readonly players: PublicPlayer[];
  /** Card count in each seat's hand, indexed by seat. */
  readonly handCounts: number[];
  /** Your own hand, sorted for display. */
  readonly hand: Card[];
  /** Cards you may legally play right now (empty if not your turn). */
  readonly legalMoves: Card[];
  readonly trick: Trick;
  /** The most recently completed trick + its winner (for the "Last trick" panel). */
  readonly lastTrick?: Trick;
  readonly lastTrickWinner?: number;
  /** Tasks are public to the whole crew. */
  readonly tasks: TaskState[];
  /** Sonar reveals made this mission (public). */
  readonly communications: Communication[];
  /** Whether each seat has spent its sonar token. */
  readonly sonarUsed: boolean[];
  /** Whether YOU may make a sonar signal right now. */
  readonly youCanCommunicate: boolean;
  /** Sonar restriction in force this mission. */
  readonly comms: CommsMode;
  /** Why sonar is blocked for you right now (null = allowed). */
  readonly sonarBlockedReason: string | null;
  /** Pending distress signal, if the crew fired one (play is blocked meanwhile). */
  readonly distress: DistressView | null;
  /** Whether the distress signal can still be fired (before the first card). */
  readonly canDistress: boolean;
  /** Deep-mission complications in force this mission. */
  readonly modifiers: MissionModifier[];
  /** Whether the CURRENT trick is an undertow trick (lowest card wins, subs sink). */
  readonly undertowTrick: boolean;
  /** Whether the commander ban still applies to the current trick. */
  readonly commanderBanActive: boolean;
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
    doneCount: state.tasks.filter((t) => t.status === "done").length,
    taskTotal: state.tasks.length,
    tricksWon: state.tricksWon,
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
    lastTrick: state.lastTrick,
    lastTrickWinner: state.lastTrickWinner,
    tasks: state.tasks,
    communications: state.communications,
    sonarUsed: state.sonarUsed,
    youCanCommunicate: canCommunicate(state, seat),
    comms: state.comms,
    sonarBlockedReason: communicateBlockedReason(state, seat),
    distress: state.distress
      ? {
          direction: state.distress.direction,
          youPicked: state.distress.picks[seat] !== null,
          waitingSeats: state.distress.picks
            .map((p, s) => (p === null ? s : -1))
            .filter((s) => s >= 0),
        }
      : null,
    canDistress: canStartDistress(state),
    modifiers: state.modifiers,
    undertowTrick: isUndertowTrick(state, state.trickNumber + 1),
    commanderBanActive: state.modifiers.some(
      (m) => m.kind === "commanderBan" && state.trickNumber < m.tricks
    ),
  };
}
