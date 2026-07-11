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

  it("keeps an empty room during the grace period, then sweeps it", () => {
    const rm = new RoomManager(8);
    const { room, player } = rm.createRoom("Only");
    rm.disconnect(room.code, player.id, 1000);
    expect(rm.getRoom(room.code)).toBeDefined(); // grace: not deleted yet
    rm.sweepEmptyRooms(120000, 1000 + 60000); // within grace
    expect(rm.getRoom(room.code)).toBeDefined();
    rm.sweepEmptyRooms(120000, 1000 + 200000); // past grace
    expect(rm.getRoom(room.code)).toBeUndefined();
  });

  it("lets a dropped player rejoin their seat mid-game (hand & state intact)", () => {
    const rm = new RoomManager(81);
    const { room } = rm.createRoom("Host");
    const j = rm.joinRoom(room.code, "Two");
    const twoId = "player" in j ? j.player.id : "";
    rm.joinRoom(room.code, "Three");
    rm.startGame(room.code, 2, 5);
    const seat = room.players.find((p) => p.id === twoId)!.seat;
    const handBefore = room.game!.hands[seat]!.length;

    rm.disconnect(room.code, twoId);
    expect(room.players.find((p) => p.id === twoId)!.connected).toBe(false);

    const res = rm.rejoin(room.code, twoId);
    expect("player" in res && res.player.seat).toBe(seat);
    expect(room.players.find((p) => p.id === twoId)!.connected).toBe(true);
    expect(room.game!.hands[seat]!.length).toBe(handBefore); // game untouched
  });

  it("rejoin fails cleanly for an unknown room or seat", () => {
    const rm = new RoomManager(82);
    const { room } = rm.createRoom("Host");
    expect(rm.rejoin("ZZZZ", "x")).toEqual({ error: "That game is no longer available." });
    expect(rm.rejoin(room.code, "nope")).toEqual({ error: "Your seat is no longer in this game." });
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

  it("lets the host choose a level (clamped) and starts that mission", () => {
    const rm = new RoomManager(20);
    const { room } = rm.createRoom("Host");
    rm.joinRoom(room.code, "Two");
    expect(rm.setLevel(room.code, 4)).toEqual({ ok: true });
    expect(room.level).toBe(4);
    expect(rm.setLevel(room.code, 999)).toEqual({ ok: true });
    expect(room.level).toBe(8); // clamped to MAX_LEVEL
    expect(rm.setLevel(room.code, -3)).toEqual({ ok: true });
    expect(room.level).toBe(0);
    rm.setLevel(room.code, 3);
    rm.startGame(room.code); // no explicit taskCount -> uses level 3 mission
    expect(room.mission?.id).toBe("mission-4"); // level 3 => "mission-4"
  });

  it("rejects changing level once the game has started", () => {
    const rm = new RoomManager(21);
    const { room } = rm.createRoom("Host");
    rm.joinRoom(room.code, "Two");
    rm.startGame(room.code, 2, 1);
    expect(rm.setLevel(room.code, 2)).toEqual({ error: "Can only change level in the lobby." });
  });

  it("won't add bots once the game has started", () => {
    const rm = new RoomManager(12);
    const { room } = rm.createRoom("Host");
    rm.addBot(room.code);
    rm.addBot(room.code);
    rm.startGame(room.code, 2, 1);
    expect(rm.addBot(room.code)).toEqual({ error: "Can only add bots in the lobby." });
  });

  it("host can kick a player (lobby), re-seating the rest; non-hosts cannot", () => {
    const rm = new RoomManager(40);
    const { room, player: host } = rm.createRoom("Host");
    const two = rm.joinRoom(room.code, "Two");
    const three = rm.joinRoom(room.code, "Three");
    const twoId = "player" in two ? two.player.id : "";
    const threeId = "player" in three ? three.player.id : "";

    // a non-host cannot kick
    expect(rm.kick(room.code, twoId, threeId)).toEqual({ error: "Only the host can remove players." });
    // host cannot kick self
    expect(rm.kick(room.code, host.id, host.id)).toEqual({ error: "You can't remove yourself." });
    // host kicks Two
    expect(rm.kick(room.code, host.id, twoId)).toEqual({ ok: true });
    expect(room.players.map((p) => p.name)).toEqual(["Host", "Three"]);
    expect(room.players.map((p) => p.seat)).toEqual([0, 1]); // re-seated contiguously
  });

  it("won't kick once the game has started", () => {
    const rm = new RoomManager(41);
    const { room, player: host } = rm.createRoom("Host");
    const two = rm.joinRoom(room.code, "Two");
    const twoId = "player" in two ? two.player.id : "";
    rm.startGame(room.code, 2, 1);
    expect(rm.kick(room.code, host.id, twoId)).toEqual({ error: "Can only remove players in the lobby." });
  });

  it("removePlayer hands the host role to a remaining player", () => {
    const rm = new RoomManager(42);
    const { room, player: host } = rm.createRoom("Host");
    const two = rm.joinRoom(room.code, "Two");
    const twoId = "player" in two ? two.player.id : "";
    rm.removePlayer(room.code, host.id);
    expect(room.hostId).toBe(twoId);
    expect(room.players.map((p) => p.seat)).toEqual([0]);
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

describe("distress signal (extension)", () => {
  it("host fires it, bots pick instantly, human passes, play resumes with a fresh plan", () => {
    const rm = new RoomManager(21);
    const { room, player: host } = rm.createRoom("Host");
    rm.addBot(room.code);
    rm.addBot(room.code);
    rm.startGame(room.code); // solvable mission (no explicit taskCount)
    expect(room.game!.distress).toBeUndefined();

    // Non-host cannot fire it.
    const bot = room.players.find((p) => p.isBot)!;
    expect(rm.distress(room.code, bot.id, "left")).toHaveProperty("error");

    // Host fires: bots pass immediately, only the human is pending.
    expect(rm.distress(room.code, host.id, "left")).toEqual({ ok: true });
    expect(room.game!.distress).toBeDefined();
    const waiting = room.game!.distress!.picks
      .map((p, s) => (p === null ? s : -1))
      .filter((s) => s >= 0);
    expect(waiting).toEqual([host.seat]);

    // Play is blocked until the human passes.
    expect(rm.isBotTurn(room.code)).toBe(false);
    const nonSub = room.game!.hands[host.seat]!.find((c) => c.suit !== "sub")!;
    expect(rm.distressPick(room.code, host.id, nonSub)).toEqual({ ok: true });
    expect(room.game!.distress).toBeUndefined();

    // Cards actually moved and the game still finishes cleanly with bots.
    expect(room.game!.hands.flat()).toHaveLength(40);
    let guard = 0;
    while (room.game!.phase === "playing" && guard++ < 200) {
      if (rm.isBotTurn(room.code)) {
        rm.playBotTurn(room.code);
      } else {
        const seat = room.game!.turn;
        const legal = legalMovesFor(room.game!, seat);
        rm.play(room.code, host.id, legal[0]!);
      }
    }
    expect(["won", "lost"]).toContain(room.phase);

    // Once per mission.
    expect(rm.distress(room.code, host.id, "left")).toHaveProperty("error");
  });
});
