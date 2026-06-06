import { describe, it, expect } from "vitest";
import { projectForSeat, legalMovesFor } from "@dsc/shared";
import { RoomManager, sanitizeName } from "./rooms.js";

describe("RoomManager", () => {
  it("creates a room with the host seated at 0", () => {
    const rm = new RoomManager(1);
    const { room, player } = rm.createRoom("Nemo");
    expect(room.code).toHaveLength(4);
    expect(room.phase).toBe("lobby");
    expect(player.seat).toBe(0);
    expect(room.hostId).toBe(player.id);
  });

  it("lets others join with sequential seats and reports a room view", () => {
    const rm = new RoomManager(2);
    const { room } = rm.createRoom("Host");
    const r1 = rm.joinRoom(room.code, "Two");
    const r2 = rm.joinRoom(room.code, "Three");
    expect("player" in r1 && r1.player.seat).toBe(1);
    expect("player" in r2 && r2.player.seat).toBe(2);
    const view = rm.toRoomView(room);
    expect(view.players.map((p) => p.name)).toEqual(["Host", "Two", "Three"]);
  });

  it("rejects joining an unknown or full room", () => {
    const rm = new RoomManager(3);
    expect(rm.joinRoom("ZZZZ", "x")).toEqual({ error: "Room not found." });
    const { room } = rm.createRoom("Host");
    for (let i = 0; i < 4; i++) rm.joinRoom(room.code, `p${i}`); // fills to 5
    expect(rm.joinRoom(room.code, "overflow")).toEqual({ error: "Room is full." });
  });

  it("requires a minimum number of players to start", () => {
    const rm = new RoomManager(4);
    const { room } = rm.createRoom("Solo");
    expect(rm.startGame(room.code)).toEqual({ error: "Need at least 2 players." });
  });

  it("starts a game, assigns a commander, and projects private hands", () => {
    const rm = new RoomManager(5);
    const { room } = rm.createRoom("Host");
    rm.joinRoom(room.code, "Two");
    rm.joinRoom(room.code, "Three");
    const res = rm.startGame(room.code, 3, 123);
    expect(res).toEqual({ ok: true });
    expect(room.phase).toBe("playing");
    expect(room.game).not.toBeNull();

    // Projection hides others' hand contents but reveals counts.
    const view = projectForSeat(room.game!, 0);
    expect(view.youSeat).toBe(0);
    expect(view.hand.length).toBe(view.handCounts[0]);
    expect(view.handCounts.reduce((a, b) => a + b, 0)).toBe(40);
    expect(view.tasks).toHaveLength(3);
    // Only the commander has legal moves at the very start.
    const total = [0, 1, 2].reduce((n, s) => n + projectForSeat(room.game!, s).legalMoves.length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("rejects an out-of-turn play through the manager", () => {
    const rm = new RoomManager(6);
    const { room, player } = rm.createRoom("Host");
    const j = rm.joinRoom(room.code, "Two");
    rm.joinRoom(room.code, "Three");
    rm.startGame(room.code, 2, 7);
    const commander = room.game!.commander;
    const nonCommander = room.players.find((p) => p.seat !== commander)!;
    const someCard = room.game!.hands[nonCommander.seat]![0]!;
    const out = rm.play(room.code, nonCommander.id, someCard);
    expect("error" in out).toBe(true);
    // sanity: referenced players exist
    expect([player.id, ("player" in j ? j.player.id : "")].filter(Boolean).length).toBe(2);
  });

  it("disconnect cleanup deletes an empty room", () => {
    const rm = new RoomManager(8);
    const { room, player } = rm.createRoom("Only");
    rm.disconnect(room.code, player.id);
    expect(rm.getRoom(room.code)).toBeUndefined();
  });

  it("adds and removes bots in the lobby and fills a game", () => {
    const rm = new RoomManager(11);
    const { room } = rm.createRoom("Host");
    expect(rm.addBot(room.code)).toEqual({ ok: true });
    expect(rm.addBot(room.code)).toEqual({ ok: true });
    expect(room.players.filter((p) => p.isBot)).toHaveLength(2);
    expect(room.players.map((p) => p.seat)).toEqual([0, 1, 2]); // contiguous seats
    expect(rm.removeBot(room.code)).toEqual({ ok: true });
    expect(room.players.filter((p) => p.isBot)).toHaveLength(1);

    // 1 human + 2 bots can start and bot turns auto-resolve via playBotTurn.
    rm.addBot(room.code);
    rm.startGame(room.code, 2, 5);
    let guard = 0;
    while (room.game!.phase === "playing" && guard++ < 200) {
      if (rm.isBotTurn(room.code)) {
        expect(rm.playBotTurn(room.code)).toBe(true);
      } else {
        // human seat: play a legal card
        const seat = room.game!.turn;
        const human = room.players.find((p) => p.seat === seat)!;
        const legal = legalMovesFor(room.game!, seat);
        rm.play(room.code, human.id, legal[0]!);
      }
    }
    expect(["won", "lost"]).toContain(room.phase);
  });

  it("won't add bots once the game has started", () => {
    const rm = new RoomManager(12);
    const { room } = rm.createRoom("Host");
    rm.addBot(room.code);
    rm.addBot(room.code);
    rm.startGame(room.code, 2, 1);
    expect(rm.addBot(room.code)).toEqual({ error: "Can only add bots in the lobby." });
  });

  it("reassigns the host when the host disconnects", () => {
    const rm = new RoomManager(9);
    const { room, player } = rm.createRoom("Host");
    const j = rm.joinRoom(room.code, "Two");
    const twoId = "player" in j ? j.player.id : "";
    expect(room.hostId).toBe(player.id);
    rm.disconnect(room.code, player.id);
    expect(rm.getRoom(room.code)).toBeDefined(); // not deleted (Two still connected)
    expect(room.hostId).toBe(twoId); // host handed off
  });
});

describe("sanitizeName", () => {
  it("trims, caps length, and defaults blanks", () => {
    expect(sanitizeName("   ")).toBe("Diver");
    expect(sanitizeName("  Captain Reef  ")).toBe("Captain Reef");
    expect(sanitizeName("x".repeat(50))).toHaveLength(16);
  });
});
