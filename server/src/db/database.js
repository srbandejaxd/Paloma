const { createClient } = require('@libsql/client')

let client

function getDb() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_TOKEN,
    })
  }
  return client
}

async function initSchema() {
  const db = getDb()
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'woodpecker',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS puzzles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_id INTEGER NOT NULL REFERENCES blocks(id),
      order_in_block INTEGER NOT NULL,
      fen TEXT NOT NULL,
      solution TEXT NOT NULL,
      UNIQUE(block_id, order_in_block)
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      block_id INTEGER NOT NULL REFERENCES blocks(id),
      attempt_number INTEGER NOT NULL,
      total_time_ms INTEGER NOT NULL,
      solved INTEGER NOT NULL,
      total_puzzles INTEGER NOT NULL,
      errors INTEGER NOT NULL DEFAULT 0,
      accuracy INTEGER NOT NULL DEFAULT 100,
      ppm REAL NOT NULL DEFAULT 0,
      score INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS puzzle_times (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES attempts(id),
      puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
      order_in_block INTEGER NOT NULL,
      time_ms INTEGER NOT NULL,
      errors INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_block ON attempts(block_id);
    CREATE INDEX IF NOT EXISTS idx_puzzle_times_attempt ON puzzle_times(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_puzzle_times_attempt ON puzzle_times(attempt_id);
    CREATE TABLE IF NOT EXISTS vision_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      mode TEXT NOT NULL,
      score INTEGER NOT NULL,
      errors INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_vision_user ON vision_sessions(user_id);
    CREATE TABLE IF NOT EXISTS blind_puzzles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number INTEGER NOT NULL UNIQUE,
      fen TEXT NOT NULL,
      solution TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS blind_progress (
      user_id INTEGER NOT NULL REFERENCES users(id),
      current_puzzle INTEGER NOT NULL DEFAULT 1,
      completed INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_blind_order ON blind_puzzles(order_number);
  `)
}

async function seedNewBlocks() {
  const db = getDb()
  for (const block of SEED_BLOCKS) {
    const existing = await db.execute({
      sql: 'SELECT id FROM blocks WHERE name = ?',
      args: [block.name]
    })
    if (existing.rows.length > 0) continue
    const r = await db.execute({
      sql: 'INSERT INTO blocks (name, description, category) VALUES (?, ?, ?)',
      args: [block.name, block.description, block.category ?? 'woodpecker']
    })
    const blockId = r.lastInsertRowid
    for (let i = 0; i < block.puzzles.length; i++) {
      const p = block.puzzles[i]
      await db.execute({
        sql: 'INSERT INTO puzzles (block_id, order_in_block, fen, solution) VALUES (?, ?, ?, ?)',
        args: [blockId, i + 1, p.fen, JSON.stringify(p.solution)]
      })
    }
    console.log(`✓ Seeded new block: ${block.name}`)
  }
}

async function migrateDb() {
  const db = getDb()
  // Add category column if it doesn't exist (safe to run on existing DBs)
  try {
    await db.execute(`ALTER TABLE blocks ADD COLUMN category TEXT NOT NULL DEFAULT 'woodpecker'`)
    console.log('✓ Migration: added category column to blocks')
  } catch {
    // Column already exists, no-op
  }
}

async function initDb() {
  await initSchema()
  await migrateDb()
  await seedNewBlocks()
  await seedBlindPuzzles()
  console.log('✓ Turso DB ready')
}

const PUZZLES_BLOCK_1 = [
  {
    fen: "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1",
    solution: ["Rxh2+", "Kxh2", "Rh8#"]
  },
  {
    fen: "rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/3K1Rp1/PPP3q1/RN1Q4 w - - 0 1",
    solution: ["Rf8+", "Bxf8", "d6+", "Be6", "Bxe6#"]
  },
  {
    fen: "r2q1rk1/pppb1ppp/3b4/4p1P1/4Pn2/2N1B2P/PPPQBP2/2KR3R w - - 0 1",
    solution: ["Bxf4", "exf4", "e5"]
  },
  {
    fen: "2kr4/1pp4p/1p1r4/5Pp1/1P2q3/2P1R2P/P3KP2/1Q1R4 b - - 0 1",
    solution: ["Rd2+"]
  },
  {
    fen: "rn1qk2r/ppp2ppp/5n2/2b1p3/2B1P1b1/3P1N2/PPP3PP/RNBQK2R w - - 0 1",
    solution: ["Bxf7+", "Kxf7", "Nxe5+"]
  },
  {
    fen: "r2k3r/pp1b3p/1qn1p1p1/1B1pPn2/Q7/P4N2/1P1BNPPP/2R3K1 w - - 0 1",
    solution: ["Rxc6", "bxc6", "Ba5"]
  },
  {
    fen: "2r1k2r/1b1p2q1/p4p2/4p3/PpB1Pp1p/7P/1PPRQPP1/4R1K1 b - - 0 1",
    solution: ["f3", "Qxf3", "Rxc4"]
  },
  {
    fen: "r3k2r/p1ppbppp/1pn1q3/4P3/2BP2n1/5NB1/1PP1Q1PP/R4K1R b - - 0 1",
    solution: ["Qxc4", "Qxc4", "Ne3+", "Ke2", "Nxc4"]
  },
  {
    fen: "1b6/3n1p2/r1k1p1pp/Pr2P3/1PK2P2/3R4/3B2PP/R7 w - - 0 1",
    solution: ["Rxd7", "Kxd7", "Kxb5"]
  },
  {
    fen: "2b5/4Q1pp/pp3n1k/3p3q/P2P1P2/BP1B2P1/7P/6K1 w - - 0 1",
    solution: ["Qxf6+", "gxf6", "Bf8#"]
  },
  {
    fen: "4r2k/1b3Q1p/p1q3p1/1p4B1/2pb4/8/PPB3PP/5R1K w - - 0 1",
    solution: ["Be4", "Qxe4", "Bf6+", "Bxf6", "Qxf6+"]
  },
  {
    fen: "r1n5/pp2q1kp/2ppr1p1/4p1Q1/8/2N4R/PPP3PP/5RK1 w - - 0 1",
    solution: ["Qh6+", "Kg8", "Rf8+", "Qxf8", "Qxh7#"]
  },
  {
    fen: "4rrk1/ppp3pp/3p2n1/3Ppqb1/nPP5/6P1/P1NBQP1P/2R1NRK1 b - - 0 1",
    solution: ["Nc3", "Bxc3", "Bxc1"]
  },
  {
    fen: "2kr3r/p4pp1/2p4p/4p3/2n4q/1NPPnP1P/PP2Q2P/R1K2B1R b - - 0 1",
    solution: ["Rxd3", "Bg2", "Rhd8", "a4", "Rd1+", "Rxd1", "Rxd1+", "Qxd1", "Nxd1"]
  },
  {
    fen: "6k1/5pp1/p1n1r2p/2NQ4/1P1p4/P6P/1B1bqPP1/5RK1 b - - 0 1",
    solution: ["Qxf1+", "Kxf1", "Re1#"]
  },
  {
    fen: "r1bqk1nr/pppp3p/2n2p2/b5p1/2BPPp1P/2P2N2/P5P1/RNBQK2R w - - 0 1",
    solution: ["Nxg5", "fxg5", "Qh5+", "Ke7", "Qf7+", "Kd6", "e5+", "Nxe5", "dxe5+", "Kxe5", "Qd5+", "Kf6", "Qxg5#"]
  },
  {
    fen: "2kr1bnr/p1ppqp1p/bpn5/1N4p1/P2PPp2/5N2/1PP2KPP/R1BQ1B1R w - - 0 1",
    solution: ["Nxa7+", "Nxa7", "Bxa6+"]
  },
  {
    fen: "rn1qk1nr/ppp2ppp/8/2b1p3/2B1P1b1/5N2/PPPP2PP/RNBQK2R w - - 0 1",
    solution: ["Bxf7+", "Kxf7", "Nxe5+"]
  },
  {
    fen: "1k2r3/2p3p1/p4p2/1p3q1p/1n6/PQ2P3/1P2B2P/2KR4 b - - 0 1",
    solution: ["Rxe3", "Qxb4", "Rxe2"]
  },
  {
    fen: "r1bqkbnr/pppp3p/2n2p2/6p1/2BPPp2/5N2/PPP3PP/RNBQK2R w - - 0 1",
    solution: ["Nxg5", "fxg5", "Qh5+", "Ke7", "Qf7+", "Kd6", "e5+", "Nxe5", "Qd5+", "Ke7", "Qxe5#"]
  }
]


const PUZZLES_BLOCK_2 = [
  {
    fen: "rnbqkbnr/pppp3p/5p2/6p1/4Pp1P/5N2/PPPP2P1/RNBQKB1R w - - 0 1",
    solution: ["Nxg5", "fxg5", "Qh5+", "Ke7", "Qxg5+", "Ke8", "Qh5+", "Ke7", "Qe5+"]
  },
  {
    fen: "rnbqkb1r/pp1p2pp/2p2p2/4p3/2B5/2P2N2/PPP2PPP/R1BQ1RK1 w - - 0 1",
    solution: ["Nxe5", "d5", "Qh5+", "g6", "Nxg6", "hxg6", "Qxh8"]
  },
  {
    fen: "2r3k1/p3qppp/2pr4/Q2b4/1P2p3/4P3/P3BPPP/2RR2K1 w - - 0 1",
    solution: ["Rxd5", "Rxd5", "Qxd5"]
  },
  {
    fen: "6k1/2p3pp/q3pn2/1pp1p3/4P3/1P1P1P2/rNP2P1P/1Q3RK1 w - - 0 1",
    solution: ["Na4", "Ra3", "Qb2", "b4", "Qxe5"]
  },
  {
    fen: "8/1p3q1k/2p3pp/4P1r1/8/4Q3/PP5P/3R3K b - - 0 1",
    solution: ["Rxe5", "Qxe5", "Qf3+", "Kg1", "Qxd1+"]
  },
  {
    fen: "r5k1/1b1n2r1/p3n2q/1p1pPRN1/2pP3P/2P3P1/PPBQ4/5R1K w - - 0 1",
    solution: ["Rf6", "Nxf6", "Rxf6"]
  },
  {
    fen: "r1b2rk1/p2p1p2/2p5/1p2PPqn/1b1p2N1/1B1P3Q/PPP3PP/R4RK1 w - - 0 1",
    solution: ["Qxh5", "Qxh5", "Nf6+", "Kh8", "Nxh5"]
  },
  {
    fen: "r5r1/p1p1k3/3q3B/5p2/4p3/1P6/P1P1QPP1/R4RK1 b - - 0 1",
    solution: ["Rxg2+", "Kxg2", "Rg8+", "Kh1", "Qxh6+", "Qh5", "Qxh5#"]
  },
  {
    fen: "6rk/p1q2p2/2p1rb1P/1p2pN2/4P1Q1/2PP4/PPB5/2K4R w - - 0 1",
    solution: ["Qg7+", "Rxg7", "hxg7+", "Kg8", "Rh8#"]
  },
  {
    fen: "4q1k1/2r3pp/1p6/8/1b2N3/4R1P1/PP3P1P/R5K1 w - - 0 1",
    solution: ["Nf6+", "gxf6", "Rxe8+"]
  },
  {
    fen: "4k3/1bp4r/p7/1p1P4/2P3pN/1P2r1P1/1BP2RPK/8 b - - 0 1",
    solution: ["Rxh4+", "gxh4", "g3+", "Kg1", "gxf2+"]
  },
  {
    fen: "2q4k/5Qp1/4B2p/p1p5/1P6/6PK/r4P1P/8 b - - 0 1",
    solution: ["Rxf2", "Qxf2", "Qxe6+"]
  },
  {
    fen: "5Rnk/pp1q4/7p/3p2rN/3Pp1Q1/2P5/PP5P/6K1 w - - 0 1",
    solution: ["Qxg5", "hxg5", "Rxg8+", "Kxg8", "Nf6+", "Kf7", "Nxd7"]
  },
  {
    fen: "r1bq2k1/pp3rpp/2n2b2/3p1p2/3P4/BQPB1N2/P4PPP/R3R1K1 w - - 0 1",
    solution: ["Qxd5", "Qxd5", "Re8+", "Rf8", "Rxf8#"]
  },
  {
    fen: "2r3k1/pb2bp1p/1p2p1p1/8/q1NPP3/3B4/P3QPPP/3R2K1 b - - 0 1",
    solution: ["Bxe4", "Bxe4", "Rxc4"]
  },
  {
    fen: "6r1/2r1k3/R3p3/p4pPp/1pPK1P2/1P3B1P/P7/8 w - - 0 1",
    solution: ["Rxe6+", "Kxe6", "Bd5+", "Kd6", "Bxg8"]
  },
  {
    fen: "r4r1k/pppqNppp/3p1B2/4p3/3nP3/3P1b2/PPPQ1PPP/R4RK1 w - - 0 1",
    solution: ["Bxg7+", "Kxg7", "Qg5+", "Kh8", "Qf6#"]
  },
  {
    fen: "3r2k1/2p2pp1/p1Q2n1p/7q/8/1P1N2P1/P1P2P2/R3K3 b - - 0 1",
    solution: ["Rxd3", "cxd3", "Qe5+", "Kd2", "Qxa1"]
  },
  {
    fen: "r1b2rk1/pp3qpp/2p1p3/2Ppb1PP/5B2/3BP3/PP3Q2/2R1K2R w - - 0 1",
    solution: ["Bxh7+", "Kxh7", "g6+"]
  },
  {
    fen: "2r2rk1/pQ1n1pp1/1p2p2p/3p4/P2P4/4P2P/1qB2PP1/2R2RK1 w - - 0 1",
    solution: ["Bh7+", "Kxh7", "Rxc8", "Rxc8", "Qxc8"]
  }
]

const PUZZLES_BLOCK_3 = [
  {
    fen: "3k4/p1p2prr/1p5N/3PRPP1/b1P5/4B3/P4K2/8 w - - 0 1",
    solution: ["f6", "Rg6"]
  },
  {
    fen: "r3k2r/pbp2qb1/1pn1p2p/3nP1pQ/3PNp2/2PB4/PP1N1BPP/R4RK1 w - - 0 1",
    solution: ["Nd6+", "cxd6", "Bg6"]
  },
  {
    fen: "4k3/1r2r1pp/1nR2p2/pp1p4/1N1P2P1/1R2PP2/PP3K1P/8 w - - 0 1",
    solution: ["Rxb6", "axb4", "Rxb7", "Rxb7", "Rxb4"]
  },
  {
    fen: "7r/1p3pp1/pn1kb2p/3p4/3N1P1P/PP1BP3/3K2P1/2R5 w - - 0 1",
    solution: ["Bxa6", "bxa6", "Rc6+", "Ke7", "Rxb6"]
  },
  {
    fen: "r3nrk1/1bp2ppp/pp2p3/3q2N1/1b1PNP2/3B2P1/PP2QP1P/2RR2K1 w - - 0 1",
    solution: ["Nxh7"]
  },
  {
    fen: "r1b1k2r/2qp1ppp/ppnbpn2/8/2PNP3/P1N1BP2/1P4PP/2RQKB1R w - - 0 1",
    solution: ["Ndb5", "axb5", "Nxb5", "Bg3+", "hxg3", "Qxg3+", "Bf2"]
  },
  {
    fen: "4r1k1/6qp/pp4p1/2pP4/4Pp2/1P6/P1R3PP/4Q2K b - - 0 1",
    solution: ["Rxe4", "Qxe4", "Qa1+"]
  },
  {
    fen: "2bq1r2/4bpk1/4pp1N/7Q/1p1p4/3B4/PP3PPP/R5K1 w - - 0 1",
    solution: ["Nxf7", "Rxf7", "Qh7+", "Kf8", "Qh8#"]
  },
  {
    fen: "r3r1k1/3b2pp/2p5/p1RpPp2/3Q1P2/1q2P1P1/6BP/R5K1 w - - 0 1",
    solution: ["Rxd5", "Be6", "Rd6"]
  },
  {
    fen: "r3br1k/pp5p/4B1p1/4NpP1/P2Pn3/q1PQ3R/7P/3R2K1 w - - 0 1",
    solution: ["Rxh7+", "Kxh7", "Qh3+", "Kg7", "Qh6#"]
  },
  {
    fen: "5rk1/ppp2ppp/6q1/2b1P3/3r4/2N1BQ1b/PP3PPP/R3R1K1 b - - 0 1",
    solution: ["Bxg2", "Qg3", "Rg4", "Bxc5", "Rxg3"]
  },
  {
    fen: "4r2k/ppp3pp/8/1PPb1p2/3P1P1b/P1Q2p1P/7R/R4KBq b - - 0 1",
    solution: ["Qg2+", "Rxg2", "fxg2#"]
  },
  {
    fen: "3r1b1k/pp4p1/2p1Qp2/5N2/PP2Pp2/2Pq4/5PKP/5R2 b - - 0 1",
    solution: ["f3+", "Kg1", "Qxf1+", "Kxf1", "Rd1#"]
  },
  {
    fen: "r1b2rk1/pp4pp/2pb4/3p1pq1/2PP4/1N1BPR2/PPQ3PP/4R1K1 b - - 0 1",
    solution: ["Bxh2+", "Kxh2", "Qh4+", "Rh3", "Qxe1"]
  },
  {
    fen: "q6r/1b4bp/4k1p1/1p2Pn2/2pPp1Q1/2P5/1P1N2PP/2B2RK1 w - - 0 1",
    solution: ["Rxf5", "gxf5", "Qxg7"]
  },
  {
    fen: "5rk1/1b1p1ppp/1qr1p3/p2pP3/P4P2/Q2B4/1PP3PP/R4R1K w - - 0 1",
    solution: ["Bxh7+", "Kxh7", "Qxf8"]
  },
  {
    fen: "5r1k/pp4pp/2p5/8/4n3/5NPQ/P3Bq1P/4R2K b - - 0 1",
    solution: ["Qxe1+", "Nxe1", "Nf2+", "Kg2", "Nxh3", "Nf3", "Nf4+", "gxf4", "Rxf4"]
  },
  {
    fen: "r4rk1/pp2bppp/1qp1p3/4Pb2/Q1P1nB2/2N5/PP1RBPPP/5RK1 w - - 0 1",
    solution: ["Nxe4", "Bxe4", "c5", "Bxc5", "Qxe4"]
  },
  {
    fen: "2r5/pp1bkp1Q/2nbpq2/3p1p2/3P1Pr1/2NBP1N1/PP4PP/2R2RK1 w - - 0 1",
    solution: ["Nxf5+", "exf5", "Nxd5+", "Ke6", "Nxf6"]
  },
  {
    fen: "r1bqr1k1/1p1nbpp1/p1p3p1/3p4/3P1B2/2NBP2P/PP3PP1/2RQ1RK1 w - - 0 1",
    solution: ["Nxd5", "cxd5", "Bc7"]
  }
]
const PUZZLES_BLOCK_4 = [
  {
    fen: "3r2k1/q1p1nppp/p3n3/1pb1p3/4P2N/1PP3PP/PBB1QPK1/7R b - - 0 1",
    solution: ["Bxf2", "Qxf2", "Qxf2+", "Kxf2", "Rd2+", "Kg1", "Rxc2"]
  },
  {
    fen: "1Q6/p4pkp/3p2p1/3P4/q7/P3rBbP/6P1/5R1K b - - 0 1",
    solution: ["Rxf3", "gxf3", "Qc2", "Rf2", "Qxf2", "Qb2+", "Qxb2"]
  },
  {
    fen: "r1bqk2r/p1pn1pp1/1p2pn1p/8/3P4/B1PB4/P1P1QPPP/R3K1NR w - - 0 1",
    solution: ["Qxe6+", "fxe6", "Bg6#"]
  },
  {
    fen: "r2qk2r/1p1b1pp1/p1pBpn1p/2P1N3/1n1P4/3B4/PPQ2PPP/2KR3R w - - 0 1",
    solution: ["Bg6", "Qa5", "Bxf7+"]
  },
  {
    fen: "1r2r1k1/p1pbqppp/Q2b1n2/3p4/P2P4/2P5/1P2BPPP/R1B1KN1R b - - 0 1",
    solution: ["Bb5", "Qxb5", "Rxb5"]
  },
  {
    fen: "1r4k1/pqp2pbp/2Q2np1/1N2p3/8/1P5P/PBP2PP1/3R2K1 w - - 0 1",
    solution: ["Rd8+", "Rxd8", "Qxb7"]
  },
  {
    fen: "rn1qkb1r/pp3p1b/2p1pnpp/4N3/2B4P/6N1/PPPPQPP1/R1B1K2R w KQkq - 0 1",
    solution: ["Nxf7", "Qe7", "Nxh8"]
  },
  {
    fen: "3n4/2prR1pk/p2r1p1p/1p5P/5P1P/P1B2K2/1PP5/4R3 w - - 0 1",
    solution: ["Bxf6", "Rxe7", "Bxe7"]
  },
  {
    fen: "6r1/1p2R3/p5k1/2p5/4Nr1P/8/PP5P/6K1 b - - 0 1",
    solution: ["Rxe4", "Rxe4", "Kf5+", "Kf2", "Kxe4"]
  },
  {
    fen: "r1b2rk1/ppqnbppp/2p1pn2/3p2B1/2PP4/2NBPN2/PPQ2PPP/R3K2R w - - 0 1",
    solution: ["Bxh7+", "Nxh7", "Bxe7"]
  },
  {
    fen: "r1b1qrk1/pppp1ppp/1bn3n1/3Np1BQ/2B1P3/3P1N2/PPP2PPP/R3K2R w - - 0 1",
    solution: ["Nf6+", "gxf6", "Bxf6", "Bxf2+", "Kxf2"]
  },
  {
    fen: "r2qrbk1/1bp2ppp/p2p1n2/2p2NB1/4P3/2N2Q2/PPP2PPP/R3R1K1 w - - 0 1",
    solution: ["Nh6+", "gxh6", "Bxf6"]
  },
  {
    fen: "r4r1k/ppn1NBpp/4b3/4P3/3p1R2/1P6/P1P3PP/R5K1 w - - 0 1",
    solution: ["Ng6+", "hxg6", "Rh4#"]
  },
  {
    fen: "2r2rk1/pp1bnp2/3q1n1Q/3p1P2/4p2N/1BPP4/P1P3PP/R4RK1 b - - 0 1",
    solution: ["Qxh2+", "Kxh2", "Ng4+", "Kg3", "Nxh6"]
  },
  {
    fen: "5rk1/pbp2ppp/qr6/8/5Q2/1PP5/P4PP1/R1B2RK1 b - - 0 1",
    solution: ["Bxg2", "Kxg2", "Rg6+"]
  },
  {
    fen: "r1b2rk1/pp1p1ppp/2n2n2/q7/2P5/P1N2NP1/3QPKBP/R1B4R b - - 0 1",
    solution: ["Qxc3", "Qxc3", "Ne4+", "Kf1", "Nxc3"]
  },
  {
    fen: "3Q4/p4pkp/1p3np1/2q5/4p3/4P1N1/PP3PPP/6K1 w - - 0 1",
    solution: ["Qxf6+", "Kxf6", "Nxe4+", "Ke5", "Nxc5", "bxc5", "Kf1"]
  },
  {
    fen: "3r4/p2q1pkp/1pn1bnp1/2p1p3/P1N1P3/1PP1Q1PP/5PK1/4RBN1 b - - 0 1",
    solution: ["Nxe4", "Qxe4", "Bd5"]
  },
  {
    fen: "2kr4/p1p2ppp/3rb3/8/2P5/1R1BR3/P4PPP/5K2 b - - 0 1",
    solution: ["Rxd3", "Rexd3", "Rxd3", "Rxd3", "Bxc4"]
  },
  {
    fen: "6k1/3q3p/p1p3pQ/1p1p4/3P2RP/1P3P2/r3r1P1/5R1K b - - 0 1",
    solution: ["Rxg2", "Rxg2", "Qh3+"]
  }
]
// ─── PATRONES DE MATE ─────────────────────────────────────────────────────────
// Agrega tus bloques aquí cuando estén listos, siguiendo el mismo formato:
// { name: 'Mate Bloque 1', description: 'Mates 1–20', category: 'mate', puzzles: MATE_PUZZLES_BLOCK_1 }
const MATE_PUZZLES_BLOCK_1 = [
  {
    fen: "7r/6pk/4Q2p/2q1p3/8/7R/5PPP/6K1 w - - 0 1",
    solution: ["Rxh6+", "gxh6", "Qf7#"]
  },
  {
    fen: "6k1/5p2/4q1p1/7p/1P4r1/PB5K/2Q2P1P/2R3R1 b - - 0 1",
    solution: ["Rg3+", "Kxg3", "Qg4#"]
  },
  {
    fen: "7R/1Q3r2/1b2rkp1/5p2/3q1P2/8/6R1/7K w - - 0 1",
    solution: ["Rxg6+", "Kxg6", "Qg2+", "Kf6", "Qg5#"]
  },
  {
    fen: "1k5r/1pp2p1r/p4bp1/8/2P2B2/1P2Pq2/P2Q2B1/3RR1K1 b - - 0 1",
    solution: ["Rh1+", "Bxh1", "Rxh1#"]
  },
  {
    fen: "3rrb2/1R3pk1/3p1n1p/2p1pQ2/2P1Pqp1/3P2R1/5NP1/6K1 w - - 0 1",
    solution: ["Rxg4+", "Nxg4", "Rxf7+", "Kg8", "Qh7#"]
  },
  {
    fen: "8/8/8/6k1/8/5Q1R/8/6K1 w - - 0 1",
    solution: ["Rh5+", "Kg6", "Qf5+", "Kg7", "Rh7+", "Kg8", "Qf7#"]
  },
  {
    fen: "2b3k1/1pr4p/p2R2p1/1q6/8/QP5P/P6K/8 w - - 0 30",
    solution: ["Rd8+", "Kf7", "Qf8+", "Ke6", "Rd6+", "Ke5", "Qf6+", "Ke4", "Rd4+", "Ke3", "Qf4+", "Ke2", "Rd2+", "Ke1", "Qf2#"]
  },
  {
    fen: "7k/6p1/5p1p/8/Q7/1B6/8/4K3 w - - 0 1",
    solution: ["Qe8+", "Kh7", "Bg8+", "Kh8", "Bf7+", "Kh7", "Qg8#"]
  },
  {
    fen: "k7/1p2p3/p1p1pb1p/5q2/2P3pP/P1P1P1B1/3Q2PK/1r6 w - - 0 1",
    solution: ["Qd8+", "Ka7", "Bb8+", "Ka8", "Bc7+", "Ka7", "Qb8#"]
  },
  {
    fen: "6k1/4Qpp1/7p/5q2/3bR3/r4B2/P5PP/5K2 b - - 0 37",
    solution: ["Rxf3+", "gxf3", "Qxf3+", "Ke1", "Bc3#"]
  },
  {
    fen: "q7/7k/4p1pp/3pN3/3Pb3/2P3QP/r5PK/4R3 w - - 0 1",
    solution: ["Rxe4", "dxe4", "Qxg6+", "Kh8", "Nf7#"]
  },
  {
    fen: "2kr1b2/Qp1q1pp1/6p1/N1p1p1n1/2P5/4PP1r/P4PK1/R1B2R2 b - - 0 1",
    solution: ["Rh2+", "Kxh2", "Qh3+", "Kg1", "Nxf3#"]
  },
  {
    fen: "r3rqk1/6p1/5pP1/8/8/1pP5/1P6/1KQR3R w - - 0 1",
    solution: ["Rh8+", "Kxh8", "Rh1+", "Kg8", "Rh8+", "Kxh8", "Qh1+", "Kg8", "Qh7#"]
  },
  {
    fen: "r4rk1/2p1q1p1/5pP1/1p1p1b2/p1nP4/5PB1/PPP3P1/1KQR3R w - - 0 1",
    solution: ["Rh8+", "Kxh8", "Rh1+", "Kg8", "Rh8+", "Kxh8", "Qh1+", "Kg8", "Qh7#"]
  },
  {
    fen: "2br1rk1/pp3p1p/2p2Pp1/4B3/3p2Pq/3P3P/PP4P1/R1Q2R1K w - - 0 1",
    solution: ["Bg3", "Qxg3", "Qh6", "Rd6", "Qg7#"]
  },
  {
    fen: "4r1k1/1p3pp1/2p1b2p/8/QP6/8/P4PPP/6K1 b - - 0 1",
    solution: ["Bb3", "Qxb3", "Re1#"]
  },
  {
    fen: "2k5/pp3ppp/2pq4/8/PP6/2P1P1NP/1r1r1P2/2R1QRK1 b - - 0 25",
    solution: ["Qxg3+", "fxg3", "Rg2+", "Kh1", "Rh2+", "Kg1", "Rbg2#"]
  },
  {
    fen: "r3r2k/1p5p/3p1b2/q1p5/2P1Q3/6R1/8/1K3R2 w - - 0 1",
    solution: ["Qxh7+", "Kxh7", "Rh1+", "Bh4", "Rxh4#"]
  },
  {
    fen: "2k4r/ppp3q1/2b3r1/8/2Q5/6P1/PPP1NR1P/5RK1 b - - 0 1",
    solution: ["Rxg3+", "Nxg3", "Qxg3+", "hxg3", "Rh1#"]
  },
  {
    fen: "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16",
    solution: ["Qb8+", "Nxb8", "Rd8#"]
  }
]

const MATE_PUZZLES_BLOCK_2 = [
  {
    fen: "r1b2rk1/ppp2ppp/8/bBQ5/5q2/2P2N1P/3N1PP1/4R1K1 w - - 0 22",
    solution: ["Qxf8+", "Kxf8", "Re8#"]
  },
  {
    fen: "rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 1",
    solution: ["Qd8+", "Kxd8", "Bg5+", "Kc7", "Bd8#"]
  },
  {
    fen: "2kr2nr/pp3ppp/8/4p3/2p1P1b1/2Pn1N2/PPK2PPP/RNB2B1R b - - 0 1",
    solution: ["Ne1+", "Nxe1", "Bd1#"]
  },
  {
    fen: "r6k/pb2n2p/1p3p2/4p3/2PP4/1P6/P1B2PrP/R2Q1R1K b - - 0 1",
    solution: ["Rg1+", "Kxg1", "Rg8+", "Qg4", "Rxg4#"]
  },
  {
    fen: "5rk1/p4ppp/1p1rp3/3qB3/3PR3/5Q1P/PP3PP1/6K1 w - - 0 1",
    solution: ["Qf6", "gxf6", "Rg4+", "Kh8", "Bxf6#"]
  },
  {
    fen: "1r3r1k/5Bpp/8/p7/P2q4/5R2/1b4PP/1Q3R1K w - - 0 1",
    solution: ["Qxh7+", "Kxh7", "Rh3+", "Qh4", "Rxh4#"]
  },
  {
    fen: "6k1/3Q1p2/6p1/P5r1/R1q1n3/7B/7P/5R1K b - - 0 1",
    solution: ["Qxf1+", "Bxf1", "Nf2#"]
  },
  {
    fen: "5rk1/5ppp/3n4/q2N4/8/1R6/2Q2PPP/6K1 w - - 0 1",
    solution: ["Ne7+", "Kh8", "Qxh7+", "Kxh7", "Rh3+", "Qh5", "Rxh5#"]
  },
  {
    fen: "3r1b1k/1p3R2/7p/2p4N/p4P2/2K3R1/PP6/3r4 w - - 0 1",
    solution: ["Rh7+", "Kxh7", "Nf6+", "Kh8", "Rg8#"]
  },
  {
    fen: "2r4k/p6p/1b1pPNpB/6P1/2p2p2/8/P1r2PK1/7R w - - 0 1",
    solution: ["Bg7+", "Kxg7", "Rxh7+", "Kf8", "Rf7#"]
  },
  {
    fen: "6rk/pp3Qp1/1q5p/3pNP2/n1p5/2P5/PP6/2K1R3 w - - 0 1",
    solution: ["Ng6+", "Kh7", "Qxg8+", "Kxg8", "Re8+", "Kf7", "Rf8#"]
  },
  {
    fen: "3r2k1/p4rPp/1b1q3Q/n1p1pP2/1p6/3B1NR1/P4P1P/6RK w - - 0 29",
    solution: ["Qxh7+", "Kxh7", "f6+", "Kg8", "Bh7+", "Kxh7", "Rh3+", "Kg8", "Rh8#"]
  },
  {
    fen: "8/p4B2/8/6pp/R7/1P4Pk/P1r4P/3n2K1 w - - 0 43",
    solution: ["Rh4+", "gxh4", "Be6#"]
  },
  {
    fen: "r3kb1r/pppn1ppp/2b1p3/q5B1/3P4/2PQ2N1/PPB2P1P/2K1R1R1 w kq - 0 13",
    solution: ["Rxe6+", "fxe6", "Qg6+", "hxg6", "Bxg6#"]
  },
  {
    fen: "r1bqk2r/p1pn1pp1/1p2pn1p/8/3P4/B1PB4/P1P1QPPP/R3K1NR w KQkq - 0 10",
    solution: ["Qxe6+", "fxe6", "Bg6#"]
  },
  {
    fen: "4r2k/6pp/8/3QN3/8/q7/5PPP/6K1 w - - 0 1",
    solution: ["Nf7+", "Kg8", "Nh6+", "Kh8", "Qg8+", "Rxg8", "Nf7#"]
  },
  {
    fen: "2r2r1k/pb2b1p1/1p4Qp/3nN3/2p1N1Pq/3B4/PPP4P/1KR4R w - - 0 1",
    solution: ["Qh7+", "Kxh7", "Nf6+", "Kh8", "Ng6#"]
  },
  {
    fen: "r2q1rk1/pb3pbp/np4pQ/3p4/1P1N4/P2BP3/1B3PPP/R3K2R w KQ - 0 16",
    solution: ["Qxg7+", "Kxg7", "Nf5+", "Kg8", "Nh6#"]
  },
  {
    fen: "7r/4Rpk1/6p1/q2p4/P3b3/5NPn/2B1QP1P/7K b - - 0 1",
    solution: ["Qe1+", "Qxe1", "Bxf3#"]
  }
]
const WP2_PUZZLES_BLOCK_1= [
  {
    fen: "1r1n1rk1/b1p1qppp/p2p1n2/4pP2/P3P3/2PPNB2/6PP/R1BQK2R w KQ - 0 1",
    solution: ["g4", "Nd7", "h4", "c6", "g5"]
  },
  {
    fen: "r2q1rk1/pbpnnpbp/1p1pp1p1/8/3PPP2/2NBB3/PPPQN1PP/R4RK1 w - - 0 1",
    solution: ["f5", "exf5", "exf5"]
  },
  {
    fen: "r3r1k1/ppq1bppp/2ppnn2/4p3/4PP2/2PP2PP/PPB1Q3/RNB2RK1 w - - 0 1",
    solution: ["f5"]
  },
  {
    fen: "r1bqk2r/3n1ppp/p3p3/1pbpP3/5P2/3n1N2/PPPBQ1PP/R2NK2R w KQkq - 0 1",
    solution: ["cxd3"]
  },
  {
    fen: "r1r3k1/3bbppp/pqn1pn2/1p6/3P1B2/1BN2N2/PP2QPPP/R3R1K1 w - - 0 1",
    solution: ["d5", "exd5", "Nxd5", "Nxd5", "Bxd5"]
  },
  {
    fen: "r1r3k1/3bbppp/pqn1pn2/1p6/3P1B2/1BN2N2/PP2QPPP/R2R2K1 b - - 0 1",
    solution: ["Na5", "Bc2", "b4", "Ne4", "Nd5"]
  },
  {
    fen: "r4rk1/1b2bppp/ppq1pn2/2ppB3/5P2/1P1BP1N1/P1PPQ1PP/R4RK1 w - - 0 1",
    solution: ["Nh5", "Nxh5", "Bxh7+", "Kxh7", "Qxh5+", "Kg8", "Bxg7"]
  },
  {
    fen: "r1bq1rnk/1pp3np/p2p2p1/3Ppp2/2P1P3/2Q2NNP/PPB2PP1/3RR1K1 b - - 0 1",
    solution: ["f4"]
  },
  {
    fen: "r1bq1rk1/pp3ppp/2n2n2/2bp4/5B2/2NBPN2/PP3PPP/2RQK2R b K - 0 1",
    solution: ["d4", "exd4", "Re8+"]
  },
  {
    fen: "r1bqk2r/pppp1ppp/2n5/8/2BPn3/2P2N2/P4PPP/R1BQ1RK1 b kq - 0 1",
    solution: ["d5"]
  },
  {
    fen: "3r2k1/1b3ppp/pqnbpn2/1p6/1P6/PQN1PN1P/1B2BPP1/2R3K1 b - - 0 1",
    solution: ["Ne5", "Nxe5", "Bxe5"]
  },
  {
    fen: "2r1r1k1/p2n1pp1/1pqpp2p/3n4/3P4/2PQ1NB1/PP3PPP/3RR1K1 b - - 0 1",
    solution: ["b5"]
  },
  {
    fen: "2rq1rk1/1p1bppbp/p2p1np1/4nPP1/3NP3/2N1B2P/PPP1B3/R2Q1RK1 b - - 0 1",
    solution: ["Rxc3", "bxc3", "Nxe4"]
  },
  {
    fen: "r4rk1/p1p3pp/2p1b3/2qpP3/5P2/1PNQ3P/P1P3PK/4RR2 w - - 0 1",
    solution: ["Na4"]
  },
  {
    fen: "r1bq1rk1/ppp2pp1/1bnp1n1p/3Np3/1PB1P3/2PP1N2/P4PPP/R1BQ1RK1 w - - 0 1",
    solution: ["a4"]
  },
  {
    fen: "r2q1rk1/2p1nppp/p1pb4/4p2b/4P3/4BN1P/PPPNQPP1/R3K2R w KQ - 0 1",
    solution: ["g4", "Bg6", "h4", "f6", "h5", "Bf7", "g5"]
  },
  {
    fen: "r4rk1/ppp1qpp1/2n4p/3np3/8/1PPPBN2/1P1Q1PPP/R4RK1 b - - 0 1",
    solution: ["a5"]
  },
  {
    fen: "r2qk1nr/ppp2ppp/2npb3/2bNp3/2B1P3/3P1N2/PPP2PPP/R1BQK2R b KQkq - 0 1",
    solution: ["Na5", "b4", "Bxd5"]
  },
  {
    fen: "r2qk2r/ppp2ppp/2np1n2/2b1p3/2B1PPb1/2NP1N2/PPP3PP/R1BQK2R w KQkq - 0 1",
    solution: ["Na4"]
  },
  {
    fen: "r1bqkb1r/5ppp/ppn1p1n1/3p4/3P4/2N1BN2/PP2PPPP/R2QKB1R w KQkq - 0 1",
    solution: ["h4", "Bd6", "h5", "Nge7", "h6", "g6", "Bg5", "O-O", "Bf6"]
  }
]
const WP2_PUZZLES_BLOCK_2= [
  {
    fen: "r2q1rk1/1b1nbppp/2p1pn2/p5B1/PpBPP3/5N2/NP2QPPP/R2R2K1 b - - 0 1",
    solution: ["c5", "dxc5", "Qc7"]
  },
  {
    fen: "r1b2rk1/pp3ppp/2n1pn2/3pN3/3P4/qP1B1N2/P1P2PPP/R2Q1RK1 b - - 0 1",
    solution: ["Nb4", "Be2", "Ne4", "Re1", "Nc3", "Qd2", "Ne4"]
  },
  {
    fen: "4rrk1/ppp2ppp/2nq4/2bnp3/2B2P2/P2P2Q1/1PP1N1PP/R1B2R1K w - - 0 1",
    solution: ["f5", "Nf6", "Nc3", "Kh8", "Bg5"]
  },
  {
    fen: "r2qk2r/p3b1pp/2p5/np1bpp2/8/2PP2N1/PPQ1NPPP/R1B2RK1 b kq - 0 1",
    solution: ["f4", "Ne4", "O-O", "f3", "c5"]
  },
  {
    fen: "r4rk1/pp1b2pp/2nqp3/2pp1p2/3P4/2PQPN2/PP2BPPP/R4RK1 b - - 0 1",
    solution: ["c4"]
  },
  {
    fen: "rn1qkbnr/ppp2ppp/4p3/4N2b/2pP4/2N5/PP2PPPP/R1BQKB1R w KQkq - 0 1",
    solution: ["g4", "Bg6", "h4", "f6", "Qa4+", "c6", "Nxg6", "hxg6", "Qxc4"]
  },
  {
    fen: "r2qk2r/pbpn1ppp/1p1ppn2/6B1/1bPP4/2NBP3/PPQ2PPP/R3K1NR w KQkq - 0 1",
    solution: ["f3"]
  },
  {
    fen: "3r2k1/pp1r1pp1/2p1pb2/5q1p/1PPP1P2/2B1Q3/P2R2PP/3R2K1 b - - 0 1",
    solution: ["b5", "c5", "g5"]
  },
  {
    fen: "r3k2r/1bq1bppp/pp2pn2/2p5/3PPP2/2PB2N1/PB4PP/R2Q1RK1 b kq - 0 1",
    solution: ["h5", "Qe2", "h4"]
  },
  {
    fen: "r3kb1r/3bqn1p/p1pp2p1/1p2pp2/1P2P3/3P1NN1/1PPBQPPP/R3K2R b KQkq - 0 1",
    solution: ["f4"]
  },
  {
    fen: "r1b1qrk1/ppp1b1pp/2nppn2/3P1p2/2P2B2/2N2NP1/PP2PPBP/2RQK2R b K - 0 1",
    solution: ["Nd8", "Nb5", "Qd7"]
  },
  {
    fen: "r1b2rk1/pp1n1pp1/2p1p2p/q7/2BP3B/b1P1PN2/P2Q1PPP/1R2K2R b K - 0 1",
    solution: ["e5"]
  },
  {
    fen: "rn1qk2r/1ppbbppp/p2p1n2/3Pp3/B3P3/2P2N2/PP3PPP/RNBQ1RK1 w kq - 0 1",
    solution: ["Bc2"]
  },
  {
    fen: "r3r1k1/pp1b1pbp/2p1p1p1/q3B3/3P4/P1PB4/1PQ2PPP/3RR1K1 w - - 0 1",
    solution: ["h4", "Qd8", "h5", "Qg5", "hxg6", "hxg6", "Re3"]
  },
  {
    fen: "r1b2rk1/ppq1b2p/2p1ppp1/8/2NP1P2/2PBP3/P1R3PP/3Q1RK1 w - - 0 1",
    solution: ["h4"]
  },
  {
    fen: "1r1q1rk1/pbpn2pp/1p1pp3/5p2/2PPn3/1P2QNP1/PB2PPBP/3R1RK1 w - - 0 1",
    solution: ["d5", "exd5", "cxd5", "Ndf6", "Nh4", "Qd7", "Bh3"]
  },
  {
    fen: "r1bq1rk1/pp2npbp/2pp2p1/4p3/2Pn4/2NP1NP1/PP1BPPBP/2RQ1RK1 w - - 0 1",
    solution: ["b4"]
  },
  {
    fen: "rn1q1rk1/pbppbppp/1p2p3/8/2PPn3/2N2NP1/PP1BPPBP/R2Q1RK1 w - - 0 1",
    solution: ["d5", "Nxd2", "Qxd2"]
  },
  {
    fen: "r1b1k2r/pp1nbppp/1qn1p3/3pP3/3P4/P2B1N2/1P2NPPP/R1BQ1K1R b kq - 0 1",
    solution: ["f6", "Nf4", "Ndxe5", "dxe5", "fxe5", "Nh5", "O-O", "Be3", "Qxb2", "Be2", "e4"]
  },
  {
    fen: "r3r1k1/2q1bppp/p3bn2/npp1p3/4P3/2P1NN2/PPB1QPPP/R1B1R1K1 w - - 0 1",
    solution: ["Ng5", "Bd7", "Nd5"]
  }
]

const WP2_PUZZLES_BLOCK_3= [
{
    fen: "r1bq1rk1/pp2b1np/n2p2pB/2pPpp2/2P1P3/2N3P1/PP1QNPBP/R4RK1 w - - 0 1",
    solution: ["f4", "Nc7", "exf5", "gxf5", "g4", "fxg4", "fxe5", "dxe5", "Rxf8+", "Bxf8", "Ng3"]
  },
  {
    fen: "r1bqkb1r/ppn2ppp/2n5/2p1p3/8/2NPB1P1/PP2PPBP/R2QK1NR w - - 0 1",
    solution: ["Bxc6+", "bxc6", "Qa4"]
  },
  {
    fen: "2r1kb1r/1p1n1ppp/pq1p1n2/4pPB1/4P3/P1N5/1PPNQ1PP/2KR3R b - - 0 1",
    solution: ["Rxc3", "bxc3", "d5", "Nb1", "dxe4"]
  },
  {
    fen: "2rqrnk1/pp3b1p/2p2bp1/3pB3/3P2P1/2NBPP2/PP5Q/4RR1K w - - 0 1",
    solution: ["f4", "Bxe5", "dxe5"]
  },
  {
    fen: "r1bqr1k1/3n1pbp/p2p1np1/1ppP4/P3P3/2NB1N1P/1PQ2PP1/R1B1R1K1 b - - 0 1",
    solution: ["c4", "Bf1", "b4", "Nb1", "Nc5", "Qxc4", "a5", "Nbd2", "Ba6", "Qc2", "Bxf1", "Kxf1", "Rc8", "Qb1", "Qb6"]
  },
  {
    fen: "r1q1nrk1/p4ppp/bpnpp3/2p5/Q1PPP3/P1PBB3/4NPPP/3R1RK1 b - - 0 1",
    solution: ["Na5", "dxc5", "dxc5"]
  },
  {
    fen: "r2qk2r/1b1n1ppp/p3pb2/2p5/3P4/1Bp2N2/PP2QPPP/R1BR2K1 w kq - 0 1",
    solution: ["d5", "cxb2", "Bxb2", "Bxb2", "dxe6"]
  },
  {
    fen: "r1b1r1k1/1pp2pb1/3p1qpp/p1nPp3/2P1P3/P1N3P1/1P3PBP/R2QNRK1 b - - 0 1",
    solution: ["a4"]
  },
  {
    fen: "r2qnrk1/pp3pbp/2n1p1p1/3pP3/3P4/4BBPP/PP3P2/RN1Q1RK1 b - - 0 1",
    solution: ["f6", "Bg4", "fxe5", "dxe5", "d4"]
  },
  {
    fen: "1r1q1rk1/2pb1pb1/1p1p1np1/pNnPp1B1/P1P1P2p/1P4P1/2Q1NPBP/4RRK1 b - - 0 1",
    solution: ["h3", "Bh1", "Qc8"]
  },
  {
    fen: "r3k2r/1pqbbpp1/p1npp2p/8/4PP1P/1NN4R/PPP2QP1/2KR1B2 b kq - 0 1",
    solution: ["b5", "g4", "b4", "Ne2", "a5"]
  },
  {
    fen: "2rq1rk1/pp1bppb1/3p2p1/4n2n/3NP2P/2N1BP2/PPPQ4/1K1R1BR1 b - - 0 1",
    solution: ["Rxc3", "bxc3", "Qc7", "Bh6", "Bxh6", "Qxh6", "Qb6+", "Ka1", "Qa5", "Qxh5", "Be6", "Nb3", "Qxc3+", "Kb1", "Rc8", "Rg2", "a5"]
  },
  {
    fen: "rn1q1rk1/pbp1bppp/1p3n2/3p4/3P4/P1N1P1N1/1P2BPPP/R1BQK2R w KQ - 0 1",
    solution: ["Nf5", "Re8", "Nxe7+"]
  },
  {
    fen: "r1b2rk1/ppq2ppp/2n1pn2/2p5/3P4/P1PBPN2/5PPP/R1BQ1RK1 b - - 0 1",
    solution: ["e5"]
  },
  {
    fen: "rnb2rk1/ppp1qppp/8/3p4/3P4/3BP3/PP3PPP/R2QK1NR b KQ - 0 1",
    solution: ["c5", "Ne2", "Nc6", "dxc5", "d4", "exd4", "Nxd4"]
  },
  {
    fen: "r3r1k1/2qbbppp/pn1p1n2/1pp1p3/3PP3/1PP2N1P/P1B1QPP1/R1B1RNK1 w - - 0 1",
    solution: ["dxe5", "dxe5", "c4", "Bc6", "Bb2", "Bf8", "N3d2"]
  },
  {
    fen: "3rr1k1/2qb1pbp/p2p1np1/np2p3/3PP3/1P2NQ1P/PBBN1PP1/R3R1K1 b - - 0 1",
    solution: ["Nc6", "d5", "Nd4", "Qd1", "Nxc2"]
  },
  {
    fen: "r4rk1/pp2bppp/1q2p1b1/4B3/2BP4/1P6/P3QPPP/3RR1K1 w - - 0 1",
    solution: ["d5", "exd5", "Rxd5"]
  },
  {
    fen: "r1b1rnk1/1pp1qppp/p1p5/4P3/3N4/P1Q3B1/1PP2PPP/3R1RK1 b - - 0 1",
    solution: ["c5", "Nf3", "b6"]
  },
  {
    fen: "2rr2k1/pn2qp1p/4b1p1/2pp4/8/6P1/PPNQPPBP/2RR2K1 w - - 0 1",
    solution: ["b4", "h5", "h4", "Nd6", "bxc5", "Rxc5", "Nd4"]
  }
]

const WP2_PUZZLES_BLOCK_4= [
   {
    fen: "rnbqkbnr/pp4pp/2p1p3/3p1p2/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 1",
    solution: ["Bf4"]
  },
  {
    fen: "2r2rk1/p2qn1pp/1p2p3/n2pPp1P/3P1N2/P2PB1Q1/5PP1/R3K2R w KQ - 0 1",
    solution: ["h6", "g6", "O-O"]
  },
  {
    fen: "r1b1qrk1/2p3bp/p2p1n2/3Ppp1n/2B5/2N1BP1P/PPQ1N1P1/2K1R2R b - - 0 1",
    solution: ["f4"]
  },
  {
    fen: "r3qrk1/2nn1pbp/p2p2p1/1ppPp1B1/2P1PP2/1PNQ4/P2N2PP/4RRK1 w - - 0 1",
    solution: ["f5", "f6", "Be3", "b4", "Na4"]
  },
  {
    fen: "rnbq1rk1/1p3pbp/p2p1np1/2pP4/P3P3/2NB1N2/1P3PPP/R1BQ1RK1 b - - 0 1",
    solution: ["Bg4", "h3", "Bxf3", "Qxf3", "Nbd7", "Bf4", "Qe7", "Qe2", "Rfe8", "Bh2", "Rac8"]
  },
  {
    fen: "r1bqnrk1/pp1n2bp/2pp2p1/4pp2/2PPP3/2N1BN2/PP3PPP/R2QRBK1 w - - 0 1",
    solution: ["exf5", "gxf5", "dxe5"]
  },
  {
    fen: "r3r1k1/1pqn1pb1/p2p1npp/2pP4/P3PB2/2N2B1P/1PQ2PP1/R3R1K1 b - - 0 1",
    solution: ["c4", "Be2", "Rac8"]
  },
  {
    fen: "r2qr1k1/ppn2pb1/3p1n1p/2pP2p1/4P1b1/P1N2NB1/1PQ1BPPP/R2R2K1 b - - 0 1",
    solution: ["Nh5", "Nd2", "Bxe2", "Nxe2", "Nb5", "Nb3"]
  },
  {
    fen: "r1bq1rk1/pppnn1bp/3p2p1/3Ppp2/1PP1P3/2N2NP1/P4PBP/R1BQ1RK1 w - - 0 1",
    solution: ["Ng5", "Nf6", "a4", "a5", "b5"]
  },
  {
    fen: "r1b2rk1/pp2qpbp/2p3p1/2n1p2n/2P1P3/2N1BP2/PP1QN1PP/1B1R1RK1 b - - 0 1",
    solution: ["Ne6", "g3"]
  },
  {
    fen: "r4rk1/pppqppbp/1n4p1/3P4/4P3/1QN1BP2/PP3P1P/2KR3R w - - 0 1",
    solution: ["h4"]
  },
  {
    fen: "r1bqn1k1/ppp2rb1/3p2np/PPPPp1p1/2N1Pp2/B1N2P2/4B1PP/R2Q1RK1 w - - 0 1",
    solution: ["b6", "axb6", "axb6", "cxb6", "Nxb6", "Rb8", "Nb5", "Bf8", "Na7"]
  },
  {
    fen: "r1bqk2r/pp2bppp/2n1pn2/3p4/2PP4/P1N2N2/1P3PPP/R1BQKB1R w KQkq - 0 1",
    solution: ["c5", "b6", "Bb5"]
  },
  {
    fen: "r1bqk2r/pp2ppbp/1nnp2p1/6B1/2PP4/2N5/PP3PPP/2RQKBNR w Kkq - 0 1",
    solution: ["d5", "Ne5", "Be2", "O-O", "b3"]
  },
  {
    fen: "r2q1r2/pp2ppkp/3p2p1/3b1P2/2P1P3/3Q4/PP4PP/2R2RK1 w - - 0 1",
    solution: ["exd5"]
  },
  {
    fen: "r2q1r2/1ppb1pbk/p1np1npp/4p3/1P2P3/1BPP1N2/PB1N1PPP/R2QR1K1 b - - 0 1",
    solution: ["Nh5"]
  },
  {
    fen: "r2qr1k1/ppn1ppbp/2bp2p1/3N4/2P1PP2/4B3/PP1QB1PP/3R1RK1 w - - 0 1",
    solution: ["f5", "Nxd5", "exd5", "Bd7", "Bd3"]
  },
  {
    fen: "r1bqk2r/pp1pppbp/2n2np1/8/2PP4/2N2N2/PP3PPP/R1BQKB1R w KQkq - 0 1",
    solution: ["d5"]
  },
  {
    fen: "r4rk1/2qnbpp1/ppbp1n1p/4pP2/P3P1PP/1NN1B3/1PP3B1/R2Q1RK1 b - - 0 1",
    solution: ["Nh7", "Bf2", "Rfc8"]
  },
  {
    fen: "r2nk1nr/pppq1pbp/3pb1p1/1P2p3/2P5/2NP1NP1/P3PPBP/R1BQK2R w KQkq - 0 1",
    solution: ["Ng5", "Bf5", "e4"]
  }
]



const SEED_BLOCKS_MATE = [
   { name: 'Mate Bloque 1', description: 'Mates 1–20', category: 'mate', puzzles: MATE_PUZZLES_BLOCK_1 },
   { name: 'Mate Bloque 2', description: 'Mates 21–40', category: 'mate', puzzles: MATE_PUZZLES_BLOCK_2 },
]

const SEED_BLOCKS_WOODPECKER2 = [
  { name: 'W2 Bloque 1', description: 'Posicionales 1–20', category: 'woodpecker2', puzzles: WP2_PUZZLES_BLOCK_1 },
  { name: 'W2 Bloque 2', description: 'Posicionales 21–40', category: 'woodpecker2', puzzles: WP2_PUZZLES_BLOCK_2 },
  { name: 'W2 Bloque 3', description: 'Posicionales 41–60', category: 'woodpecker2', puzzles: WP2_PUZZLES_BLOCK_3 },
  { name: 'W2 Bloque 4', description: 'Posicionales 61–80', category: 'woodpecker2', puzzles: WP2_PUZZLES_BLOCK_4 },
]
const SEED_BLOCKS = [
  { name: 'Bloque 1', description: 'Puzzles 1–20', category: 'woodpecker', puzzles: PUZZLES_BLOCK_1 },
  { name: 'Bloque 2', description: 'Puzzles 21–40', category: 'woodpecker', puzzles: PUZZLES_BLOCK_2 },
  { name: 'Bloque 3', description: 'Puzzles 41–60', category: 'woodpecker', puzzles: PUZZLES_BLOCK_3 },
  { name: 'Bloque 4', description: 'Puzzles 61–80', category: 'woodpecker', puzzles: PUZZLES_BLOCK_4 },
  ...SEED_BLOCKS_MATE,
  ...SEED_BLOCKS_WOODPECKER2,
]
// ─── BLIND PUZZLES ────────────────────────────────────────────────────────────
const BLIND_PUZZLES = [
  {
    order: 1,
    fen: "kr6/1p6/p7/4b3/8/8/6BP/R6K w - - 0 0",
    solution: ["Rxa6#"]
  },
  {
    order: 2,
    fen: "r2B3k/5p1p/8/8/8/b7/7P/K5R1 w - - 0 0",
    solution: ["Bf6#"]
  },
  {
    order: 3,
    fen: "8/R6p/4pkp1/3rN3/3P3P/6P1/2n3K1/8 w - - 0 0",
    solution: ["Rf7#"]
  },
  {
    order: 4,
    fen: "7k/2r1n1p1/4Bp2/3P4/5K2/6P1/2p2PP1/R7 w - - 0 0",
    solution: ["Rh1#"]
  },
  {
    order: 5,
    fen: "1k1r4/1bNr4/3P1p2/6p1/7p/8/6PP/RR5K w - - 0 0",
    solution: ["Ra8#"]
  },
  {
    order: 6,
    fen: "r6R/ppk1b3/2p1P3/P7/3N4/4q3/6PP/2R4K w - - 0 0",
    solution: ["Nb5#"]
  },
  {
    order: 7,
    fen: "2rrk1n1/1nQ1p2N/pB5p/6p1/qP3p2/2P4P/P3BPP1/3R2K1 w - - 0 0",
    solution: ["Bh5#"]
  },
  {
    order: 8,
    fen: "8/P7/2b1n3/2bk1N2/5P2/3P2Pp/4P2P/7K w - - 0 0",
    solution: ["e4#"]
  },
  {
    order: 9,
    fen: "6kb/p3p2p/5P1B/4Nn2/8/8/7P/R6K w - - 0 0",
    solution: ["f7#"]
  },
  {
    order: 10,
    fen: "r2B3k/5p1p/7N/8/8/b7/7P/K7 w - - 0 0",
    solution: ["Bf6#"]
  },
  {
    order: 11,
    fen: "n3r2r/k1P4R/pp6/8/8/5BB1/6P1/7K w - - 0 0",
    solution: ["c8=N#"]
  },
  {
    order: 12,
    fen: "1kb2q2/ppp5/3pn3/1N6/P7/1P6/2P2QPP/7K w - - 0 0",
    solution: ["Qxa7#"]
  },
  {
    order: 13,
    fen: "r7/8/rR6/5kn1/3P1p2/3P3P/6P1/5R1K w - - 0 0",
    solution: ["g4#"]
  },
  {
    order: 14,
    fen: "r2qkb1r/pp2nppp/2p5/4N3/2BP4/2N5/PP3PPP/R2bK2R w KQkq - 0 0",
    solution: ["Bxf7#"]
  },
  {
    order: 15,
    fen: "1kr5/p7/6p1/5b2/1N6/5B2/6PP/1R5K w - - 0 0",
    solution: ["Na6#"]
  },
  {
    order: 16,
    fen: "4nkq1/2p3pp/1r1p4/8/5B2/1Q4P1/P6P/5R1K w - - 0 0",
    solution: ["Bxd6#"]
  },
  {
    order: 17,
    fen: "8/3b2Q1/3Pkr2/1p6/4P2p/7P/P5PK/8 w - - 0 0",
    solution: ["Qe7#"]
  },
  {
    order: 18,
    fen: "8/p1p1bkp1/2Q1nNq1/3pP1rp/1P1P1p2/P4PrP/1B4PK/2R3R1 w - - 0 0",
    solution: ["Qe8#"]
  },
  {
    order: 19,
    fen: "8/5Q2/8/6p1/6kr/4K3/8/8 w - - 0 0",
    solution: ["Qf3#"]
  },
  {
    order: 20,
    fen: "4r1rk/pppp2p1/4p2p/2nq2N1/8/3QP1P1/PBPP1P2/1K5R w - - 0 0",
    solution: ["Qh7#"]
  },
  {
    order: 21,
    fen: "4kr2/2r2p2/2N1p3/4R2B/5P2/1Pq5/P1P3PP/2KR4 w - - 0 0",
    solution: ["Rd8#"]
  },
  {
    order: 22,
    fen: "r1b2R2/ppp1k2p/2np1N2/4P3/2B5/8/PPP1K1PP/8 w - - 0 0",
    solution: ["Re8#"]
  },
  {
    order: 23,
    fen: "4Q3/8/q4p1p/5kb1/1Pb5/2P1BP2/1K4P1/8 w - - 0 0",
    solution: ["g4#"]
  },
  {
    order: 24,
    fen: "r2qk2r/ppp1npBp/2nb4/3N4/2B3b1/P4N2/5PPP/R2QR1K1 w kq - 0 0",
    solution: ["Nf6#"]
  },
  {
    order: 25,
    fen: "r1bqkb1r/pp1npppp/2p2n2/8/3PN3/8/PPP1QPPP/R1B1KBNR w KQkq - 0 0",
    solution: ["Nd6#"]
  },
  {
    order: 26,
    fen: "r3q1n1/4k3/7R/1pp3P1/1P2P3/r1N5/P1P4Q/1K3R2 w - - 0 0",
    solution: ["Qd6#"]
  },
  {
    order: 27,
    fen: "r3kb1r/pp3p1p/4bB1q/4Q3/5p2/3P4/PPP3PP/4R2K w kq - 0 0",
    solution: ["Qb5#"]
  },
  {
    order: 28,
    fen: "3kq3/R6r/8/8/3KQ3/8/8/8 w - - 0 0",
    solution: ["Qa8#"]
  },
  {
    order: 29,
    fen: "8/8/8/knN5/1n6/8/3N4/4K3 w - - 0 0",
    solution: ["Nc4#"]
  },
  {
    order: 30,
    fen: "4k3/5p2/2N2Qp1/2p4p/1p2q3/7P/5PPK/8 w - - 0 0",
    solution: ["Qd8#"]
  },
  {
    order: 31,
    fen: "r1b4r/p1Q5/1p2p3/1q3k2/5B2/2p2P2/P5PP/3R2K1 w - - 0 0",
    solution: ["Qf7#"]
  },
  {
    order: 32,
    fen: "rnbq1bnr/ppppk2p/8/7Q/2B1Pp2/8/PPPP2PP/RNB1K2R w KQ - 0 1",
    solution: ["Qe5#"]
  },
  {
    order: 33,
    fen: "2r2r1k/3R1p2/p1P3R1/1p2q1Pp/7P/5Q2/P4PK1/8 w - - 0 0",
    solution: ["Qxh5#"]
  },
  {
    order: 34,
    fen: "4r2k/7p/p1pQ2pN/8/4q3/7R/P1P3PK/8 w - - 0 0",
    solution: ["Qf6#"]
  },
  {
    order: 35,
    fen: "6n1/5kp1/6Np/6PP/B7/2q5/p7/4R2K w - - 0 0",
    solution: ["Be8#"]
  },
  {
    order: 36,
    fen: "1Q2r3/8/p1k4p/qpNbB3/8/1P6/2P5/1K6 w - - 0 0",
    solution: ["Qd6#"]
  },
  {
    order: 37,
    fen: "r1bqk2r/p1pn2p1/1p2pn1p/8/3P4/BPP5/P1B2PPP/R3K1NR w KQkq - 0 0",
    solution: ["Bg6#"]
  },
  {
    order: 38,
    fen: "R7/3b2kr/1p1p3N/2pPn1B1/2P5/5P2/4PK2/8 w - - 0 0",
    solution: ["Rg8#"]
  },
  {
    order: 39,
    fen: "2q4k/4N1bp/8/4N3/8/p7/8/7K w - - 0 0",
    solution: ["Nf7#"]
  },
  {
    order: 40,
    fen: "7r/4p1nk/1pp2p2/2np4/4N2P/P2B2P1/1PPB4/1K6 w - - 0 0",
    solution: ["Nxf6#"]
  },
  {
    order: 41,
    fen: "1k1r4/pr6/1N3p2/4N1p1/3P3p/6BP/5PP1/7K w - - 0 0",
    solution: ["Nc6#"]
  },
  {
    order: 42,
    fen: "5n2/p1pp1pk1/1p5p/4R3/7q/P7/1BB2PPP/6K1 w - - 0 0",
    solution: ["Rg5#"]
  },
  {
    order: 43,
    fen: "2Qqkb2/p2npppp/1p6/8/BP6/2P3N1/3P1PPP/4K3 w - - 0 0",
    solution: ["Bxd7#"]
  },
  {
    order: 44,
    fen: "r2q1b1r/ppp1kBpp/3p4/4N3/3P4/8/PPP2PPP/R1BbK2R w KQ - 0 0",
    solution: ["Bg5#"]
  },
  {
    order: 45,
    fen: "rnbq1bnr/pppp1kP1/7p/4Q3/5P2/8/PPPP2PP/RNB1KBNR w KQ - 0 0",
    solution: ["gxh8=N#"]
  },
  {
    order: 46,
    fen: "6k1/p4qpp/1p6/8/8/1Q5P/r4PP1/4R1K1 w - - 0 0",
    solution: ["Re8#"]
  },
  {
    order: 47,
    fen: "5Nnk/6p1/3N3p/8/1p5P/1n4P1/5P1K/8 w - - 0 0",
    solution: ["Nf7#"]
  },
  {
    order: 48,
    fen: "3r2r1/7k/5Pp1/3R4/8/3B2P1/6K1/8 w - - 0 0",
    solution: ["Rh5#"]
  },
  {
    order: 49,
    fen: "8/8/5R2/2k1N1R1/3n1n2/2r1N1K1/5r2/8 w - - 0 0",
    solution: ["Nd3#"]
  },
  {
    order: 50,
    fen: "2k5/2r3pp/1pQ1Pq2/1ppp4/8/1P6/P4PPP/3R2K1 w - - 0 0",
    solution: ["Qa8#"]
  },
  {
    order: 51,
    fen: "8/1Q2p2p/2Npkbp1/5p2/5P2/6P1/7r/3K4 w - - 0 0",
    solution: ["Nd8#"]
  },
  {
    order: 52,
    fen: "3B4/1p6/2p5/6Qp/p7/5q1k/P4P2/3R1K2 w - - 0 0",
    solution: ["Qh4#"]
  },
  {
    order: 53,
    fen: "8/4r3/2nN3p/BR6/2pkp3/P2n2P1/6BP/6K1 w - - 0 1",
    solution: ["Nf5#"]
  },
  {
    order: 54,
    fen: "3bkr2/R5p1/4N1Pp/8/7q/7P/7K/3B4 w - - 0 0",
    solution: ["Nxg7#"]
  },
  {
    order: 55,
    fen: "4r1k1/5Rpp/8/1P3Q2/P4P2/1B6/2P2PKP/4q3 w - - 0 0",
    solution: ["Rf8#"]
  },
  {
    order: 56,
    fen: "8/1p6/p3pR2/4R3/4b3/2B1kp1P/PP2r1P1/6K1 w - - 0 0",
    solution: ["Rxf3#"]
  },
  {
    order: 57,
    fen: "3r1rk1/pR5p/5p2/1p3Pn1/4B2Q/4q3/8/6RK w - - 0 0",
    solution: ["Qxh7#"]
  },
  {
    order: 58,
    fen: "1r1k4/2R4R/8/8/8/6pP/PPP4q/K1B5 w - - 0 0",
    solution: ["Bg5+", "Ke8", "Rh8#"]
  },
  {
    order: 59,
    fen: "3qr1k1/pp3pp1/2p1b3/4P3/8/2PQ4/PPB2PP1/4K2R w K - 0 0",
    solution: ["Rh8+", "Kxh8", "Qh7#"]
  },
  {
    order: 60,
    fen: "r2q1r2/pp2np2/1bp4p/3p2pk/1P1N2b1/2PB2B1/P5PP/R2QK2R w KQ - 0 0",
    solution: ["Qxg4+", "Kxg4", "Be2#"]
  },
  {
    order: 61,
    fen: "3R4/2q3nk/7p/5P2/6PP/P7/1P1Q4/1K6 w - - 0 0",
    solution: ["Qxh6+", "Kxh6", "Rh8#"]
  },
  {
    order: 62,
    fen: "1r5r/ppq1n1k1/3p1ppp/3B1b2/2P2P2/1R2B3/PQ4PP/1R4K1 w - - 0 0",
    solution: ["Qxf6+", "Kxf6", "Bd4#"]
  },
  {
    order: 63,
    fen: "2q2r1k/p3b1pp/8/6N1/8/1Q6/B4PPP/7K w - - 0 0",
    solution: ["Qg8+", "Rxg8", "Nf7#"]
  },
  {
    order: 64,
    fen: "1rn5/7p/p3P1pk/4QR2/2r5/P1P5/KP2p1NP/2q5 w - - 0 0",
    solution: ["Rh5+", "gxh5", "Qf6#"]
  },
  {
    order: 65,
    fen: "6R1/5b1p/6pk/5pn1/3N1PP1/8/6PP/7K w - - 0 0",
    solution: ["Nxf5+", "gxf5", "fxg5#"]
  },
  {
    order: 66,
    fen: "5rk1/7p/1prN2p1/1b6/q7/5P2/PBQ3P1/K6R w - - 0 0",
    solution: ["Qxg6+", "hxg6", "Rh8#"]
  },
  {
    order: 67,
    fen: "4kb2/rppn1ppp/2N5/4pP1q/P7/1P4QP/2B3P1/3R2K1 w - - 0 0",
    solution: ["Qxe5+", "Nxe5", "Rd8#"]
  },
  {
    order: 68,
    fen: "5k2/q2r4/4RP1p/5P1P/p7/1B6/P7/K5R1 w - - 0 0",
    solution: ["Re8+", "Kxe8", "Rg8#"]
  },
  {
    order: 69,
    fen: "r1r1n1k1/4RRp1/1Bp3Q1/3p4/2P4p/1P4PP/Pq4B1/7K w - - 0 0",
    solution: ["Rf8+", "Kxf8", "Qf7#"]
  },
  {
    order: 70,
    fen: "5r1k/4qp1p/3p3Q/4n3/4N3/7P/1B4P1/7K w - - 0 0",
    solution: ["Nf6", "Qxf6", "Qxf8#"]
  },
  {
    order: 71,
    fen: "1b4k1/r5np/1p5B/p1p5/2q3P1/7P/8/4QRK1 w - - 0 0",
    solution: ["Qe8+", "Nxe8", "Rf8#"]
  },
  {
    order: 72,
    fen: "1r1k4/2R4R/8/8/6P1/6pP/PPP2p1q/K4B2 w - - 0 0",
    solution: ["Rcg7", "Qg1", "Rh8#"]
  },
  {
    order: 73,
    fen: "5k2/1b2Rp1p/6p1/5q1P/BB4N1/8/PPP2PP1/1K6 w - - 0 0",
    solution: ["Re8+", "Kg7", "h6#"]
  },
  {
    order: 74,
    fen: "r2q3k/pppb1Q1p/3p1b1p/8/2B5/8/PP3PPP/4R1K1 w - - 0 0",
    solution: ["Re8+", "Bxe8", "Qg8#"]
  },
  {
    order: 75,
    fen: "6R1/p4p2/1p2q2p/8/6Pk/8/PP2r1PK/3Q4 w - - 0 0",
    solution: ["Qe1+", "Rxe1", "g3#"]
  },
  {
    order: 76,
    fen: "qn5k/p5pp/5p2/8/7n/1BB5/5QPP/2K5 w - - 0 0",
    solution: ["Qxf6", "gxf6", "Bxf6#"]
  },
  {
    order: 77,
    fen: "2rr4/1b1n1p1k/3Pq1p1/8/p2Bp1P1/1N2R3/1PP2R1P/6K1 w - - 0 0",
    solution: ["Rh3+", "Kg8", "Rh8#"]
  },
  {
    order: 78,
    fen: "2r1nr1k/pp1q1p1p/3bpp2/5P2/1P1Q4/P3P3/1B3P1P/R3K1R1 w Q - 0 0",
    solution: ["Qxf6+", "Nxf6", "Bxf6#"]
  },
  {
    order: 79,
    fen: "r1bqr2k/pppp1Qpn/2n5/2b1p1P1/2B1P3/2PP4/PP3PP1/RN2K2R w KQ - 0 0",
    solution: ["Rxh7+", "Kxh7", "Qh5#"]
  },
  {
    order: 80,
    fen: "3n1qk1/2N2p1p/4b2r/2Q5/1R5r/B7/5PPP/7K w - - 0 0",
    solution: ["Rg4+", "Rxg4", "Qxf8#"]
  },
  {
    order: 81,
    fen: "kbK5/pp6/1P6/8/8/8/8/R7 w - - 0 0",
    solution: ["Ra6", "bxa6", "b7#"]
  },
  {
    order: 82,
    fen: "r2kq2r/p3bp1p/2p2Q2/1b1p2B1/8/2N4B/PP6/R5K1 w - - 0 0",
    solution: ["Qd6+", "Qd7", "Qxd7#"]
  },
  {
    order: 83,
    fen: "8/8/8/6N1/4N3/8/3n4/4k1K1 w - - 0 0",
    solution: ["Nc3", "Nf3+", "Nxf3#"]
  },
  {
    order: 84,
    fen: "r2n1k1r/ppp1n2p/4QN2/4p1N1/3b4/q7/P4PPP/R3R1K1 w - - 0 0",
    solution: ["Qf7+", "Nxf7", "Ne6#"]
  },
  {
    order: 85,
    fen: "1q4k1/3pp2b/4n1NQ/5N2/8/8/6PP/7K w - - 0 0",
    solution: ["Qg7+", "Nxg7", "Nh6#"]
  },
  {
    order: 86,
    fen: "2B5/2p5/2P5/p7/k1K5/8/1P2p3/8 w - - 0 0",
    solution: ["Ba6", "e1=Q", "Bb5#"]
  },
  {
    order: 87,
    fen: "3rkr2/1p3p2/b1n2Qpb/7p/P3N2B/1B6/1P1q1PPP/1K5R w - - 0 0",
    solution: ["Qe7+", "Nxe7", "Nf6#"]
  },
  {
    order: 88,
    fen: "r6k/n2R4/8/8/4N3/5p2/5K2/8 w - - 0 0",
    solution: ["Nf6", "Rf8", "Rh7#"]
  },
  {
    order: 89,
    fen: "rq5k/6pp/8/4p3/3p1N2/1B6/PPP5/1KR5 w - - 0 0",
    solution: ["Ng6+", "hxg6", "Rh1#"]
  },
  {
    order: 90,
    fen: "2kr4/pp1rb3/b1p5/8/7p/P5BP/P1P3Q1/KR6 w - - 0 0",
    solution: ["Qxc6+", "bxc6", "Rb8#"]
  },
  {
    order: 91,
    fen: "2kr2nr/pp1n1ppp/2p1p3/8/1P1P1B2/2N2Q1P/1PPKBPP1/7q w - - 0 0",
    solution: ["Qxc6+", "bxc6", "Ba6#"]
  },
  {
    order: 92,
    fen: "2kr1b1r/1p1N2p1/4Q3/pB1p3p/P2q1B1P/2N5/1PP2P2/2K4R w - - 0 0",
    solution: ["Nc5+", "Rd7", "Qxd7#"]
  },
  {
    order: 93,
    fen: "1kr5/2p5/1p6/5Pq1/B4pP1/8/3P4/R1K5 w - - 0 0",
    solution: ["Bc6", "f3", "Ra8#"]
  },
  {
    order: 94,
    fen: "rrb5/1p3p1k/1NnB1Qpp/8/6P1/5P2/2p3K1/8 w - - 0 0",
    solution: ["Bf8", "c1=Q", "Qg7#"]
  },
  {
    order: 95,
    fen: "5n2/P6R/1k6/1P6/3P4/1KN3r1/3p4/8 w - - 0 0",
    solution: ["a8=N+", "Ka5", "Ra7#"]
  },
  {
    order: 96,
    fen: "1r3nk1/7p/6p1/3N1p2/4b2B/8/Bp4PP/7K w - - 0 0",
    solution: ["Ne7+", "Kh8", "Bf6#"]
  },
  {
    order: 97,
    fen: "5r1k/p2R1p1p/1p3N2/4rn2/6R1/P6P/1P4PK/8 w - - 0 0",
    solution: ["Rxf7", "Rxf7", "Rg8#"]
  },
  {
    order: 98,
    fen: "r2qkr2/p2nb1Qp/bp2P3/3p1Np1/8/8/PPP2PPP/1N2K2R w Kq - 0 0",
    solution: ["Qg6+", "hxg6", "Ng7#"]
  },
  {
    order: 99,
    fen: "2bq1nkb/2p4p/2pp3Q/r4NpN/p2PP3/2P5/PP4PP/5RK1 w - - 0 0",
    solution: ["Qe6+", "Bxe6", "Nh6#"]
  },
  {
    order: 100,
    fen: "1bk5/1p1rRpp1/pBp2n2/7q/8/7P/3Q2P1/7K w - - 0 0",
    solution: ["Qxd7+", "Nxd7", "Re8#"]
  },
  {
    order: 101,
    fen: "1k4rq/1p1p4/p2Pp3/4P3/8/4QB2/6PP/5K2 w - - 0 0",
    solution: ["Qb6", "Qxe5", "Qxb7#"]
  },
  {
    order: 102,
    fen: "r7/npp5/k7/8/KPp5/3q4/5Q2/6B1 w - - 0 0",
    solution: ["Qxa7+", "Rxa7", "b5#"]
  },
  {
    order: 103,
    fen: "8/3R4/1k6/1pN5/4b3/1N3q2/5P1P/3R2K1 w - - 0 0",
    solution: ["R1d6+", "Bc6", "Rb7#"]
  },
  {
    order: 104,
    fen: "8/8/7p/2p1K1pk/1pP4p/pP5P/P7/8 w - - 0 0",
    solution: ["Kf5", "g4", "hxg4#"]
  },
  {
    order: 105,
    fen: "1k6/3K4/P7/3B4/8/B5n1/3n1p2/8 w - - 0 0",
    solution: ["Bc5", "f1=Q", "a7#"]
  },
  {
    order: 106,
    fen: "6k1/pr3p1p/8/4P1B1/8/2n5/P5RP/K7 w - - 0 0",
    solution: ["Be7+", "Kh8", "Bf6#"]
  },
  {
    order: 107,
    fen: "1B6/2pp4/3k4/1P6/2K1R3/8/p6p/8 w - - 0 0",
    solution: ["Ba7", "a1=Q", "Bc5#"]
  },
  {
    order: 108,
    fen: "6k1/pp2q2p/2b4Q/6N1/8/8/PP1r2PP/5RK1 w - - 0 0",
    solution: ["Rf8+", "Qxf8", "Qxh7#"]
  },
  {
    order: 109,
    fen: "3q2kr/1p3p1p/5b1B/3N4/2P5/8/5KP1/4Q3 w - - 0 0",
    solution: ["Qe8+", "Qxe8", "Nxf6#"]
  },
  {
    order: 110,
    fen: "2Rr3k/2R4p/4p3/q2rp3/8/7P/1PP4Q/1K6 w - - 0 0",
    solution: ["Qxe5+", "Rxe5", "Rxd8#"]
  },
  {
    order: 111,
    fen: "2b2k1r/1p3pp1/5N2/q3N3/8/7P/1P2Q1P1/1K6 w - - 0 1",
    solution: ["Ng6+", "fxg6", "Qe8#"]
  },
  {
    order: 112,
    fen: "6R1/4qp1p/ppr1n1pk/8/1P4QP/6N1/P4PP1/6K1 w - - 0 0",
    solution: ["Qh5+", "gxh5", "Nf5#"]
  },
  {
    order: 113,
    fen: "r4Br1/p1q2p1k/1p1R2p1/3pP2b/7Q/2p5/P1P1NPPP/6K1 w - - 0 0",
    solution: ["Qxh5+", "gxh5", "Rh6#"]
  },
  {
    order: 114,
    fen: "4rk2/5pp1/1p6/b2R2B1/1q6/8/P3QPP1/5K2 w - - 0 0",
    solution: ["Qxe8+", "Kxe8", "Rd8#"]
  },
  {
    order: 115,
    fen: "4N3/1q6/6b1/2pk1n2/2N5/4P3/2Q1K3/8 w - - 0 0",
    solution: ["Qe4+", "Kxe4", "Nf6#"]
  },
  {
    order: 116,
    fen: "kr1q4/nb1N4/8/8/8/6Q1/PP6/1K5R w - - 0 1",
    solution: ["Qxb8+", "Qxb8", "Nb6#"]
  },
  {
    order: 117,
    fen: "r1r5/ppp2kp1/3pNB2/3P1p2/2P1pP2/1P2Pq2/P2Q3K/2R3R1 w - - 0 0",
    solution: ["Rxg7+", "Kxf6", "Qd4#"]
  },
  {
    order: 118,
    fen: "R3K2k/7p/6P1/8/2p5/8/P5q1/8 w - - 0 0",
    solution: ["Kf7+", "Qxa8", "g7#"]
  },
  {
    order: 119,
    fen: "r1rR4/5Qqk/p5pp/1p6/8/P6P/5PPK/4R3 w - - 0 0",
    solution: ["Re7", "Qxf7", "Rxf7#"]
  },
  {
    order: 120,
    fen: "3rk2r/p1qn1pp1/1p2pb1p/7P/2Pp4/B1P1QP2/P1B1KP2/4R2R w k - 0 0",
    solution: ["Qxe6+", "fxe6", "Bg6#"]
  },
  {
    order: 121,
    fen: "2rkr3/R7/3Bb3/2p1N1p1/8/8/1P4P1/6K1 w - - 0 0",
    solution: ["Rd7+", "Bxd7", "Nf7#"]
  },
  {
    order: 122,
    fen: "4b1k1/8/5PP1/8/3B4/1pp5/2q5/K6R w - - 0 0",
    solution: ["Rh8+", "Kxh8", "f7#"]
  },
  {
    order: 123,
    fen: "1Q6/5kpn/5bN1/7P/8/2q4B/6PP/7K w - - 0 0",
    solution: ["Qg8+", "Kxg8", "Be6#"]
  },
  {
    order: 124,
    fen: "1q5k/2Q1R1pp/p7/3p4/P1p5/6R1/1r2r1PK/8 w - - 0 0",
    solution: ["Re8+", "Qxe8", "Qxg7#"]
  },
  {
    order: 125,
    fen: "5K1k/6p1/5b1n/4N3/3qBQ2/8/8/8 w - - 0 0",
    solution: ["Qxh6+", "gxh6", "Nf7#"]
  },
  {
    order: 126,
    fen: "4R2r/1r1qQbk1/3P1p1p/2B2Pp1/6P1/5P2/5RK1/8 w - - 0 1",
    solution: ["Qxf6+", "Kxf6", "Bd4#"]
  },
  {
    order: 127,
    fen: "2r2rk1/2q2p1p/5RpQ/7P/8/1P6/PBP5/1K6 w - - 0 0",
    solution: ["Qg7+", "Kxg7", "Rxg6#"]
  },
  {
    order: 128,
    fen: "1krr4/p1p3b1/p1B5/3N4/8/8/KP4p1/8 w - - 0 0",
    solution: ["Nb4", "g1=Q", "Nxa6#"]
  },
  {
    order: 129,
    fen: "r3rk2/pp1q1p2/4bBp1/3p4/5R2/8/8/6K1 w - - 0 0",
    solution: ["Rh4", "Rec8", "Rh8#"]
  },
  {
    order: 130,
    fen: "k3r3/p3bpp1/1pN4p/2p5/8/8/8/1K1R4 w - - 0 0",
    solution: ["Rd7", "Rd8", "Rxa7#"]
  },
  {
    order: 131,
    fen: "4k3/2R3p1/4N3/3P4/4b1r1/2K1p3/5p2/8 w - - 0 0",
    solution: ["d6", "f1=Q", "Re7#"]
  },
  {
    order: 132,
    fen: "8/2Q5/2n1qkp1/p6p/1pPpP1P1/1P1N1K2/P7/8 w - - 0 0",
    solution: ["g5+", "Kxg5", "Qf4#"]
  },
  {
    order: 133,
    fen: "8/4q3/8/bp6/pk6/1np1N3/1Q6/1K6 w - - 0 0",
    solution: ["Qa3+", "Kxa3", "Nc2#"]
  },
  {
    order: 134,
    fen: "r7/5R2/6N1/4p3/2K1k3/4r3/7P/3R4 w - - 0 0",
    solution: ["Rd4+", "exd4", "Rf4#"]
  },
  {
    order: 135,
    fen: "7k/pp4np/2p3p1/3pN1q1/3P4/Q7/1r3rPP/2R2RK1 w - - 0 0",
    solution: ["Qf8+", "Rxf8", "Rxf8#"]
  },
  {
    order: 136,
    fen: "3r4/7p/6B1/8/2N2pp1/5k2/3P1P2/b4K2 w - - 0 0",
    solution: ["d4", "Rxd4", "Ne5#"]
  },
  {
    order: 137,
    fen: "q1B4k/6pp/8/2p5/2P2N2/1P5R/3r4/1K6 w - - 0 0",
    solution: ["Ng6+", "Kg8", "Be6#"]
  },
  {
    order: 138,
    fen: "2Q2n2/2R4p/1p1qpp1k/8/3P2PP/3B4/5PK1/r1r5 w - - 0 0",
    solution: ["Qxf8+", "Qxf8", "Rxh7#"]
  },
  {
    order: 139,
    fen: "r1q3k1/4Q1Pb/1n2p2B/4P2p/1p4p1/2p1K1P1/1P4N1/3R4 w - - 0 0",
    solution: ["Rd8+", "Qxd8", "Qxe6#"]
  },
  {
    order: 140,
    fen: "4rn2/4pkb1/1qppnp2/1p3N1b/p7/2PB2Q1/1B4PP/2R1R2K w - - 0 0",
    solution: ["Qxg7+", "Nxg7", "Nh6#"]
  },
  {
    order: 141,
    fen: "r3rk2/2bb1p1p/1pN3p1/p7/8/2B1Q2P/PP3PP1/5K2 w - - 0 0",
    solution: ["Qh6+", "Kg8", "Qg7#"]
  },
  {
    order: 142,
    fen: "6rr/8/2qp1B2/2p5/1pP1k1p1/1P2P3/1K1P3p/5R2 w - - 0 0",
    solution: ["Kc2", "h1=Q", "Rf4#"]
  },
  {
    order: 143,
    fen: "2r5/pp1kP3/6q1/3PQ3/2P5/6B1/6p1/6K1 w - - 0 0",
    solution: ["e8=Q+", "Qxe8", "Qd6#"]
  },
  {
    order: 144,
    fen: "1Q6/r5bk/2p3R1/p1qr1p2/2N1p3/1P6/1PP5/1K4R1 w - - 0 0",
    solution: ["Rh6+", "Bxh6", "Qg8#"]
  },
  {
    order: 145,
    fen: "1r6/p1p2B1p/3b2nk/8/6R1/1P1P3P/PBP1r3/6RK w - - 0 0",
    solution: ["Rh4+", "Nxh4", "Bg7#"]
  },
  {
    order: 146,
    fen: "r2q4/1b6/1p3p2/k3n3/pN6/2P5/3NQPPP/5RK1 w - - 0 0",
    solution: ["Nb3+", "axb3", "Ra1#"]
  },
  {
    order: 147,
    fen: "8/5KBk/6p1/6Pb/7R/8/8/4q3 w - - 0 0",
    solution: ["Rxh5+", "gxh5", "g6#"]
  },
  {
    order: 148,
    fen: "r6r/1p2bQ1p/p6k/2q3p1/6P1/P7/1PP5/1K3R1b w - - 0 0",
    solution: ["Rf6+", "Bxf6", "Qxf6#"]
  },
  {
    order: 149,
    fen: "3R1rk1/p5p1/1p4q1/n4pN1/7Q/2p4P/2P2P2/6K1 w - - 0 0",
    solution: ["Qh8+", "Kxh8", "Rxf8#"]
  },
  {
    order: 150,
    fen: "r1qr1kn1/p3b1pp/1p2Rn2/4N3/2Q5/2N5/PPP2PPP/R5K1 w - - 0 0",
    solution: ["Rxf6+", "Nxf6", "Qf7#"]
  },
  {
    order: 151,
    fen: "r1r3q1/8/1K1pR3/3N4/2k3N1/p7/2P5/8 w - - 0 0",
    solution: ["Re4+", "Kxd5", "Nf6#"]
  },
  {
    order: 152,
    fen: "1r2q3/1R6/3p1kp1/1ppBp1b1/p3Pp2/2PP4/PP3P2/5K1Q w - - 0 0",
    solution: ["Qh8+", "Qxh8", "Rf7#"]
  },
  {
    order: 153,
    fen: "8/8/R7/3nk3/1R4K1/1pPr4/8/8 w - - 0 0",
    solution: ["Re4+", "Kxe4", "Re6#"]
  },
  {
    order: 154,
    fen: "7n/4N1kp/3Q3p/2p3pP/3b2P1/1r6/1r1q4/K4RB1 w - - 0 0",
    solution: ["Qxh6+", "Kxh6", "Nf5#"]
  },
  {
    order: 155,
    fen: "5R2/5r1q/p4k2/1bP2p2/7r/P5Q1/1P3KP1/4R3 w - - 0 1",
    solution: ["Re6+", "Kxe6", "Qd6#"]
  },
  {
    order: 156,
    fen: "1brr1k2/2R3n1/4p2N/pB5N/4q3/8/3Q1P1K/8 w - - 0 0",
    solution: ["Qd6+", "Rxd6", "Rf7#"]
  },
  {
    order: 157,
    fen: "1q6/6NK/5p2/1r2r1kb/6pp/8/8/5R2 w - - 0 0",
    solution: ["Rf5+", "Rxf5", "Ne6#"]
  },
  {
    order: 158,
    fen: "6q1/3p4/4np2/2P1k3/7K/3PP3/8/1B3R2 w - - 0 1",
    solution: ["Rf5+", "Kxf5", "d4#"]
  },
  {
    order: 159,
    fen: "r4r1k/1b6/p4pPB/1p5Q/7K/1P3qP1/P6P/8 w - - 0 0",
    solution: ["Bg7+", "Kxg7", "Qh7#"]
  },
  {
    order: 160,
    fen: "2b2n1r/5N2/ppp3r1/7k/3P1R1p/5P1N/PP3K2/6R1 w - - 0 0",
    solution: ["Rf5+", "Bxf5", "Nf4#"]
  },
  {
    order: 161,
    fen: "3r2r1/pb1qb2k/4R1pB/1p5Q/3P4/2P5/P4PPP/6K1 w - - 0 0",
    solution: ["Bf8+", "gxh5", "Rh6#"]
  },
  {
    order: 162,
    fen: "1r6/2q2p1r/ppN1nkp1/3pR2p/b2B3P/2PP2P1/5PB1/1R4K1 w - - 0 0",
    solution: ["Rf5+", "Kxf5", "Bh3#"]
  },
  {
    order: 163,
    fen: "rnb1kr2/ppp1n1p1/1q2p3/6Np/5Q2/8/PPP2PPP/2KR1B1R w q - 0 0",
    solution: ["Qxf8+", "Kxf8", "Rd8#"]
  },
  {
    order: 164,
    fen: "2q3rk/6p1/8/6p1/R3Q3/7P/5PPK/8 w - - 0 0",
    solution: ["Qh4+", "gxh4", "Rxh4#"]
  },
  {
    order: 165,
    fen: "2n1b1r1/ppr2N1k/4PQp1/6Pp/3P4/P2B4/1P3KPP/n7 w - - 0 0",
    solution: ["Bxg6+", "Rxg6", "Qh8#"]
  },
  {
    order: 166,
    fen: "r2Nqb1r/pQ1bp1pp/1pn1p3/2kp4/P1p2B2/2P5/1PP2PPP/R3KB1R w KQ - 0 0",
    solution: ["Qxc6+", "Bxc6", "Nxe6#"]
  },
  {
    order: 167,
    fen: "4k2r/pPpn1ppp/1b6/3R2B1/8/8/PP3PPP/6K1 w k - 0 0",
    solution: ["b8=Q+", "Nxb8", "Rd8#"]
  },
  {
    order: 168,
    fen: "rnbq1b1r/pppp1Q1p/2k2p2/4p1p1/2B5/2P5/PPP2PPP/3RK2R w K - 0 0",
    solution: ["Qd5+", "Kb6", "Qb5#"]
  },
  {
    order: 169,
    fen: "r2b1k2/pp3p1p/2p3p1/7N/7q/8/PP1B4/2K1R2B w - - 0 0",
    solution: ["Bh6+", "Kg8", "Re8#"]
  },
  {
    order: 170,
    fen: "6r1/1R6/8/p5r1/kp6/7R/1P5P/7K w - - 0 0",
    solution: ["Ra3+", "bxa3", "b3#"]
  },
  {
    order: 171,
    fen: "3Q4/3p1p2/2b1k3/R7/4P3/4P3/K7/5r1q w - - 0 0",
    solution: ["Re5+", "Kd6", "Qb8#"]
  },
  {
    order: 172,
    fen: "5r2/6R1/7p/3Q4/6pk/8/5q1P/7K w - - 0 0",
    solution: ["Qg5+", "hxg5", "Rh7#"]
  },
  {
    order: 173,
    fen: "4r1k1/3p4/7K/3N4/2B5/8/8/8 w - - 0 0",
    solution: ["Ne7+", "Kf8", "Ng6#"]
  },
  {
    order: 174,
    fen: "2B4r/2K5/8/2pkp3/1p1b4/5R2/4P3/8 w - - 0 0",
    solution: ["e4+", "Kc4", "Ba6#"]
  },
  {
    order: 175,
    fen: "5kr1/6p1/q2b2B1/4n1B1/8/8/5P2/2RQ2K1 w - - 0 0",
    solution: ["Rc8+", "Qxc8", "Qxd6#"]
  },
  {
    order: 176,
    fen: "b1r1r3/pk3ppp/1p1Q4/8/4q3/4B3/1KP2PPP/R2R4 w - - 0 0",
    solution: ["Rxa7+", "Kxa7", "Qxb6#"]
  },
  {
    order: 177,
    fen: "7k/4qp1P/p5pQ/1p6/8/8/PPP1r3/2K4R w - - 0 0",
    solution: ["Qg7+", "Kxg7", "h8=Q#"]
  },
  {
    order: 178,
    fen: "2R5/p1R3b1/1q5k/4n1p1/4B3/6P1/7P/7K w - - 0 0",
    solution: ["Rh8+", "Bxh8", "Rh7#"]
  },
  {
    order: 179,
    fen: "4B3/6pk/4R2p/8/8/7P/2rr2PK/8 w - - 0 0",
    solution: ["Bg6+", "Kg8", "Re8#"]
  },
  {
    order: 180,
    fen: "8/R3Pr2/2nk4/8/3PK3/8/8/8 w - - 0 0",
    solution: ["e8=N+", "Ke6", "d5#"]
  },
  {
    order: 181,
    fen: "6rk/p1n3pp/3N2b1/3rP3/1P6/3R3R/5P2/1B4K1 w - - 0 0",
    solution: ["Rxh7+", "Bxh7", "Nf7#"]
  },
  {
    order: 182,
    fen: "r1b3k1/pp1p3p/3p2pB/8/q1P5/1P6/P5PP/4R1K1 w - - 0 0",
    solution: ["Rf1", "Qxc4", "Rf8#"]
  },
  {
    order: 183,
    fen: "4qrk1/1p4p1/b1p3Q1/5p1B/8/P5P1/1P3P1R/6K1 w - - 0 0",
    solution: ["Qh7+", "Kxh7", "Bf7#"]
  },
  {
    order: 184,
    fen: "2k2bnr/Qpp2ppp/q7/8/8/2N1Bn2/PP3PPP/2KR4 w - - 0 0",
    solution: ["Qb8+", "Kxb8", "Rd8#"]
  },
  {
    order: 185,
    fen: "4bkr1/6p1/1q5P/4N3/8/4R3/Q7/6K1 w - - 0 0",
    solution: ["Qf7+", "Bxf7", "Nd7#"]
  },
  {
    order: 186,
    fen: "r4rk1/ppp1qpp1/1bnp1B1p/6NQ/2BPP1b1/4n3/PP4PP/RN3RK1 w - - 0 0",
    solution: ["Qg6", "hxg5", "Qxg7#"]
  },
  {
    order: 187,
    fen: "6k1/8/3P4/1b1R1n2/8/8/8/4K3 b - - 0 1",
    solution: ["Bd7"]
  },
  {
    order: 188,
    fen: "r1bq1rk1/p1pnbppp/1p2p3/8/3P4/2NB4/PPP1QPPP/R1B1K2R w KQ - 0 0",
    solution: ["Qe4"]
  },
  {
    order: 189,
    fen: "6k1/8/8/1b1R1n2/8/8/6K1/8 b - - 0 1",
    solution: ["Bc6"]
  },
  {
    order: 190,
    fen: "6k1/5pp1/8/1p1r1r2/8/1R5P/4P1PK/1R6 w - - 0 0",
    solution: ["e4"]
  },
  {
    order: 191,
    fen: "1r4k1/p4p2/7R/8/6b1/8/B5PP/6K1 w - - 0 0",
    solution: ["Rg6+"]
  },
  {
    order: 192,
    fen: "r2q1rk1/1ppbb1pp/pnp1p3/4N3/8/8/PPP1QPPP/RNBR2K1 w - - 0 0",
    solution: ["Nxd7", "Nxd7", "Qxe6+", "Kh8", "Qxd7"]
  },
  {
    order: 193,
    fen: "3r3k/ppp3pp/1q6/n7/8/2B2P1P/PPB3P1/2Q4K w - - 0 0",
    solution: ["Bxg7+", "Kxg7", "Qg5+", "Kf7", "Qxd8"]
  },
  {
    order: 194,
    fen: "r2qk2r/p2p1ppp/1pbbp3/7n/2P1P3/P1N1B3/1PQ2PPP/R3KB1R w KQkq - 0 0",
    solution: ["Qd1", "Nf6", "Qxd6"]
  },
  {
    order: 195,
    fen: "5kn1/p1b1nppQ/1p6/4p3/r7/P6P/1P3PP1/5RK1 w - - 0 0",
    solution: ["Qc2"]
  },
  {
    order: 196,
    fen: "2r2rk1/ppq2ppp/2p5/8/3b4/3B3P/PPP1QPP1/R4RK1 w - - 0 0",
    solution: ["Qe4", "g6", "Qxd4"]
  },
  {
    order: 197,
    fen: "5rk1/pp2bppp/2pq4/8/8/2P2Q1P/PPB2PP1/4R2K w - - 0 0",
    solution: ["Qe4", "g6", "Qxe7"]
  },
  {
    order: 198,
    fen: "r2rnk2/5ppp/pp2P3/4P3/3N4/Pb4P1/1P3K1P/2RR4 w - - 0 0",
    solution: ["e7+", "Kxe7", "Nc6+", "Ke6", "Rxd8", "Rxd8", "Nxd8+"]
  },
  {
    order: 199,
    fen: "5rk1/5ppp/b1p1p3/2PnP3/1q1B4/6P1/4rP1P/1BQRR1K1 w - - 0 0",
    solution: ["Rxe2", "Bxe2", "Qc2", "g6", "Qxe2"]
  },
  {
    order: 200,
    fen: "r6k/2p2p1p/p5p1/p7/2r5/2P4P/1P3PP1/4Q1K1 w - - 0 0",
    solution: ["Qe5+", "Kg8", "Qd5", "Re8", "Qxc4"]
  },
  {
    order: 201,
    fen: "6k1/5pb1/1p1N3p/p5p1/5q2/Q6P/PPr5/3RR2K w - - 0 0",
    solution: ["Re8+", "Kh7", "Qd3+", "f5", "Qxc2"]
  },
  {
    order: 202,
    fen: "8/8/4np2/4pk1p/RNr4P/P3KP2/1P6/8 w - - 0 0",
    solution: ["Nd5", "Kg6", "Rxc4"]
  },
  {
    order: 203,
    fen: "2r2rk1/pbqnbppp/1p6/3Pp3/2p1P3/P1P2N2/1BB1QPPP/3RR1K1 w - - 0 0",
    solution: ["d6", "Qc5", "dxe7"]
  },
  {
    order: 204,
    fen: "r3k2r/pp2qppp/2p3b1/P2pP3/1b1P4/2N4P/1P1B1PP1/R2Q1RK1 w kq - 0 0",
    solution: ["Nxd5", "cxd5", "Qa4+", "Kd8", "Bxb4"]
  },
  {
    order: 205,
    fen: "2r3k1/4bppp/1r2p3/qb6/5B2/2N3R1/PP3PPP/2R1Q2K w - - 0 0",
    solution: ["Bc7", "Rxc7", "Qe5", "Bf8", "Qxc7"]
  },
  {
    order: 206,
    fen: "3r1q1k/p5b1/1r3p1p/1ppBpQpP/4P3/2P3P1/PP1R1PK1/3R4 w - - 0 0",
    solution: ["Bg8", "Qxg8", "Rxd8"]
  },
  {
    order: 207,
    fen: "4rbnk/2pq2pp/p2p1p2/1p1P2N1/1P1P4/4BQ1P/P4PP1/5RK1 w - - 0 0",
    solution: ["Qf5", "Qxf5", "Nf7#"]
  },
  {
    order: 208,
    fen: "7k/p2q2pp/2pP1p2/2r1p3/P7/7P/3Q1PP1/3R2K1 w - - 0 0",
    solution: ["Qb4", "Rd5", "Qb8+", "Qe8", "Qxe8#"]
  },
  {
    order: 209,
    fen: "r1b1r1k1/pp3p1p/5qpB/3p4/3b4/1Q4P1/PP3PBP/3R1RK1 w - - 0 0",
    solution: ["Qa4", "Rd8", "Qxd4"]
  },
  {
    order: 210,
    fen: "2r3k1/p2q1ppp/1p1b4/2p2N2/8/2PP4/PP2Q1PP/R6K w - - 0 0",
    solution: ["Qg4", "g6", "Nh6+", "Kg7", "Qxd7"]
  },
  {
    order: 211,
    fen: "r2r4/k4pp1/pp3q2/2pPR3/P7/2P1N2P/5PPQ/6K1 w - - 0 0",
    solution: ["Re6", "fxe6", "Qc7#"]
  },
  {
    order: 212,
    fen: "r2r2k1/pp1bqp2/4p1pp/nP6/4Q3/2PB1N2/P4PPP/R2R2K1 w - - 0 0",
    solution: ["Qb4", "Qxb4", "cxb4", "b6", "bxa5"]
  },
  {
    order: 213,
    fen: "r7/pp5k/2p1b1p1/8/7r/1PQ5/P5PP/5R1K w - - 0 0",
    solution: ["Qe1", "Rh5", "Qxe6"]
  },
  {
    order: 214,
    fen: "rn3q1k/1bp3pp/p7/3P4/2QP4/2NB4/PP4PP/2K1R3 w - - 0 0",
    solution: ["Qb4", "Qg8", "Qxb7"]
  },
  {
    order: 215,
    fen: "r7/8/p2R1rk1/1p3q1p/3Q3P/2P3P1/5P2/R5K1 w - - 0 0",
    solution: ["Rxf6+", "Qxf6", "Qe4+", "Kg7", "Qxa8"]
  },
  {
    order: 216,
    fen: "r4rk1/pQp2p1p/6p1/6N1/8/3PP1P1/4KP2/b7 w - - 0 0",
    solution: ["Qh1", "h5", "Qxa1"]
  },
  {
    order: 217,
    fen: "1r4k1/5p1p/6pB/8/8/4Q2P/qn3PK1/1R6 w - - 0 0",
    solution: ["Qe5", "f6", "Qxb8+"]
  },
  {
    order: 218,
    fen: "5r1k/1bQ3np/2p3p1/1pP1R3/1P6/1B3q2/1B3N2/5K2 w - - 0 0",
    solution: ["Rf5", "Rg8", "Rxf3"]
  },
  {
    order: 219,
    fen: "r1bq1r2/pp2Rpk1/6p1/3pb3/7Q/2PB4/P4PP1/RN3K2 w - - 0 0",
    solution: ["Qg5", "Bf6", "Qxg6+", "Kh8", "Qh7#"]
  },
  {
    order: 220,
    fen: "r4rk1/1p3pbp/1n1pq3/p5P1/3P4/1PN1BQ1R/1P5P/R6K w - - 0 0",
    solution: ["d5", "Nxd5", "Nxd5"]
  },
  {
    order: 221,
    fen: "r4rk1/pp3ppp/2pb1n2/q7/8/P4QP1/1PPN1PBP/3R1RK1 w - - 0 0",
    solution: ["Nc4", "Qc7", "Nxd6"]
  },
  {
    order: 222,
    fen: "3r2k1/5ppp/bn6/ppp2N2/3Pq3/P1P5/1B1Q2PP/2R3K1 w - - 0 0",
    solution: ["Qg5", "g6", "Qxd8+", "Qe8", "Qxe8#"]
  },
  {
    order: 223,
    fen: "1rr3k1/4qppp/pn6/1pp1n2b/4P3/P1PP2QP/2B3PN/R1B2RK1 w - - 0 0",
    solution: ["Rf5", "Bg6", "Rxe5"]
  },
  {
    order: 224,
    fen: "6kr/np1pp3/2q5/p7/8/5PN1/PPP3P1/1K1Q3R w - - 0 0",
    solution: ["Rxh8+", "Kxh8", "Qd4+", "Kg8", "Qxa7"]
  },
  {
    order: 225,
    fen: "r3k2r/ppqn1ppp/2nbp3/1Bpp4/Q2P2b1/2P1PN2/PP1N1PPP/R1B2RK1 w kq - 0 0",
    solution: ["dxc5", "Nxc5", "Qxg4"]
  },
  {
    order: 226,
    fen: "5rk1/5ppp/1qp2n2/3p1b2/4p3/1NP1P1P1/5PBP/1R1Q2K1 w - - 0 0",
    solution: ["Nd4", "Qc7", "Nxf5"]
  },
  {
    order: 227,
    fen: "5rk1/5ppp/1q6/4p3/2r4P/1NP1P1Pb/5P2/1RRQ2K1 w - - 0 0",
    solution: ["Nd2", "Qc6"]
  },
  {
    order: 228,
    fen: "r1bq1rk1/ppp2ppp/8/2n3PQ/3pP3/P7/1PP2PBP/3RK1NR w K - 0 0",
    solution: ["g6", "hxg6", "Qxc5"]
  },
  {
    order: 229,
    fen: "2r3k1/3q2bp/1p2p1p1/4n3/3Np3/B1P1P1P1/1P2QP2/3R2K1 w - - 0 0",
    solution: ["Nf5", "Qb7", "Ne7+", "Kh8", "Nxc8"]
  },
  {
    order: 230,
    fen: "R7/P7/2K5/8/2k5/8/8/r7 w - - 0 0",
    solution: ["Rc8", "Rxa7", "Kb6+", "Kd4", "Kxa7"]
  },
  {
    order: 231,
    fen: "2rr2k1/p4bpp/5p2/1qBn4/3p2Q1/P5P1/5PBP/2R2RK1 w - - 0 0",
    solution: ["Bf8", "Rxf8", "Rxc8", "Rxc8", "Qxc8+"]
  },
  {
    order: 232,
    fen: "1R3b2/3p1k1p/6r1/5q2/5B2/5Q2/6PP/6K1 w - - 0 1",
    solution: ["Rxf8+", "Kxf8", "Bd6+", "Rxd6", "Qxf5+"]
  },
  {
    order: 233,
    fen: "r3r1k1/1p1q1pp1/p1pb4/6Np/3PR2P/PP1Q2P1/1B3PK1/8 w - - 0 0",
    solution: ["Re7", "g6", "Rxd7"]
  },
  {
    order: 234,
    fen: "r1b2rk1/2p1qnbp/p1pp2p1/5p2/2PQP3/1PN2N1P/PB3PP1/3R1RK1 w - - 0 0",
    solution: ["Nd5", "Ne5", "Nxe7+"]
  },
  {
    order: 235,
    fen: "r4rk1/1p1qnppp/p2p1b2/3P1N2/8/5Q2/PP3PPP/R1B1R1K1 w - - 0 0",
    solution: ["Rxe7", "Bxe7", "Qg4", "g6", "Nh6+", "Kg7", "Qxd7"]
  },
  {
    order: 236,
    fen: "2Q4r/5ppk/7p/8/4N3/3q3P/5PP1/6K1 w - - 0 0",
    solution: ["Qf5+", "g6", "Nf6+", "Kg7", "Qxd3"]
  },
  {
    order: 237,
    fen: "r1b3rk/p3q1pp/2pR4/5p2/5N2/Q5PP/PP3P2/3R2K1 w - - 0 0",
    solution: ["Rh6", "gxh6", "Qxe7"]
  },
  {
    order: 238,
    fen: "8/3q4/7p/6p1/r4pk1/1pQB4/1P2PP1K/8 w - - 0 0",
    solution: ["Bb5", "Kh5", "Bxd7"]
  },
  {
    order: 239,
    fen: "r5rk/n2R2pp/4p3/qN4Q1/5p2/8/P1b2PPP/5RK1 w - - 0 0",
    solution: ["Nd6", "Qf5", "Nxf5"]
  },
  {
    order: 240,
    fen: "2kr2nr/1ppq2pp/p1pB4/8/6Q1/8/PP3PPP/RN1R2K1 w - - 0 0",
    solution: ["Be7", "Nxe7", "Rxd7"]
  },
  {
    order: 241,
    fen: "3rk1r1/5p1p/p2p1bp1/3Qn3/N3P3/1P3B2/P1q3PP/R4R1K w - - 0 0",
    solution: ["Bd1", "Qc6", "Rxf6"]
  },
  {
    order: 242,
    fen: "3rn3/pp1q1rbR/3k4/2p1pP1Q/3pP3/P2P1N2/1PP5/6RK w - - 0 0",
    solution: ["f6", "Nxf6", "Qxe5+", "Kc6", "Rhxg7", "Rxg7", "Qxf6+"]
  },
  {
    order: 243,
    fen: "3r1k2/ppqnrpp1/2pNpn1p/2P4P/3P1B2/3R2R1/PP2QPP1/1K6 w - - 0 0",
    solution: ["Rxg7", "Kxg7", "Nf5+", "Kf8", "Bxc7"]
  },
  {
    order: 244,
    fen: "2R2bk1/3r3p/4ppp1/7n/8/8/3B1PPP/3R1K2 w - - 0 0",
    solution: ["Rxf8+", "Kxf8", "Bh6+", "Ke8", "Rxd7", "Kxd7", "g4"]
  },
  {
    order: 245,
    fen: "1kr5/ppp5/2nP1qp1/5p2/P2R3p/1P3Q1P/1BP3P1/7K w - - 0 0",
    solution: ["Qxc6", "bxc6", "Rb4+", "Ka8", "Bxf6"]
  },
  {
    order: 246,
    fen: "4rbk1/pq4pp/1p3p2/3b1Q2/1P1P4/5NP1/5PBP/1R4K1 w - - 0 0",
    solution: ["Ng5", "fxg5", "Bxd5+"]
  },
  {
    order: 247,
    fen: "2r3k1/b1N1npp1/7p/3p4/3P4/1N2P3/1P1K4/2R5 w - - 0 0",
    solution: ["Nxd5", "Rxc1", "Nxe7+", "Kf8", "Ng6+", "fxg6", "Kxc1"]
  },
  {
    order: 248,
    fen: "1r4k1/pQp2ppp/n7/2q2b2/8/6P1/PB1PPP2/1R2K2R w K - 0 0",
    solution: ["Qxb8+", "Nxb8", "Ba3", "Qb6", "Rxb6"]
  },
  {
    order: 249,
    fen: "r4rk1/2bn1pp1/p1bqp1p1/2NpN1B1/3P4/8/PP3PPP/2RQR1K1 w - - 0 0",
    solution: ["Ne4", "dxe4", "Rxc6", "Qd5", "Rxc7"]
  },
  {
    order: 250,
    fen: "2r2rn1/pp3p1p/5qpk/2p1Q3/3pPNP1/3P1R2/PPP4P/R5K1 w - - 0 0",
    solution: ["Ne6", "fxe6", "Rxf6"]
  },
  {
    order: 251,
    fen: "r3r1k1/p3npp1/bb2p2p/3pN2n/P2P2P1/1P2QN1q/1B3P2/1BR1R1K1 w - - 0 0",
    solution: ["Ng5", "hxg5", "Qxh3"]
  },
  {
    order: 252,
    fen: "7k/8/4qpp1/8/5K2/7N/8/7R w - - 0 0",
    solution: ["Ng5+", "Kg7", "Nxe6+"]
  },
  {
    order: 253,
    fen: "k7/pR6/8/2p5/8/8/6B1/K1q5 w - - 0 0",
    solution: ["Rb1#"]
  },
  {
    order: 254,
    fen: "k7/1R6/p1B5/1np4q/1b6/8/8/K7 w - - 0 0",
    solution: ["Rxb5+", "Ka7", "Rb7+", "Ka8", "Rxb4+", "Ka7", "Rb7+", "Ka8", "Rh7+", "Kb8", "Rxh5"]
  },
  {
    order: 255,
    fen: "8/8/3b4/3p4/2k1PR2/8/3K4/8 w - - 0 0",
    solution: ["e5+", "Kc5", "exd6"]
  },
  {
    order: 256,
    fen: "1B6/6r1/8/4K3/8/2P3k1/8/8 w - - 0 0",
    solution: ["Kf6+", "Kf3", "Kxg7"]
  },
  {
    order: 257,
    fen: "K7/8/2B5/3N4/8/8/8/1q5k w - - 0 0",
    solution: ["Nc3+", "Kg1", "Nxb1"]
  },
  {
    order: 258,
    fen: "7k/6q1/8/8/7B/8/8/K6R w - - 0 0",
    solution: ["Bf6+", "Kg8", "Bxg7"]
  },
  {
    order: 259,
    fen: "8/4r3/1B1p4/2P3K1/8/4k3/8/8 w - - 0 0",
    solution: ["cxd6+", "Kd3", "dxe7"]
  },
  {
    order: 260,
    fen: "r6r/1p4p1/2k1bp2/p2p3p/Rb1PpB1P/1PN1P3/1P1K1PP1/2R5 w - - 0 0",
    solution: ["Rxb4", "axb4", "Nxd5+", "Kd7", "Nb6+", "Ke7", "Rc7+", "Kd8", "Nxa8"]
  },
  {
    order: 261,
    fen: "4r3/pb4k1/1p3Rp1/3p4/3B4/2P5/P2K2PP/8 w - - 0 0",
    solution: ["Rxb6+", "Kf7", "Rxb7+"]
  },
  {
    order: 262,
    fen: "4R3/6rk/3p2r1/p2q3p/P2B4/2P4P/1P1Q2P1/6K1 w - - 0 0",
    solution: ["Rh8+", "Kxh8", "Bxg7+", "Rxg7", "Qxd5"]
  },
  {
    order: 263,
    fen: "2q2r2/R1P4k/6pp/1pQ5/1P3P2/8/6PP/6K1 w - - 0 0",
    solution: ["Qxf8", "Qxf8", "c8=Q+"]
  },
  {
    order: 264,
    fen: "r4rk1/pp1qn1bp/4pp2/3p4/5P1N/2PQBP2/PP3K2/6RR w - - 0 0",
    solution: ["Qxh7+", "Kxh7", "Nf5+", "Bh6", "Rxh6#"]
  },
  {
    order: 265,
    fen: "1r4k1/q3bpp1/p2p3p/8/3n4/1N1B3P/PP2QPP1/3R2K1 w - - 0 0",
    solution: ["Nxd4", "Qxd4", "Bh7+", "Kxh7", "Rxd4"]
  },
  {
    order: 266,
    fen: "r4r2/3q4/2p3kp/2Pn2p1/4N3/6N1/6PP/1Q2R1K1 w - - 0 0",
    solution: ["Nf6+", "Kxf6", "Nh5+", "Kf7", "Qh7#"]
  },
  {
    order: 267,
    fen: "1r3r2/4pp1k/4B1pB/n2Pp3/2q4Q/8/6PP/5RK1 w - - 0 0",
    solution: ["Bxf8+", "Qxh4", "Rxf7+", "Kh8", "Bg7+", "Kg8", "Rxe7+", "Kh7", "Bf6+", "Kh6", "Bxh4"]
  },
  {
    order: 268,
    fen: "r1b2r2/5P1p/ppn3pk/2p1p1Nq/1bP1PQ2/3P4/PB4BP/1R3RK1 w - - 0 0",
    solution: ["Ne6+", "g5", "Qf6+", "Qg6", "Bc1", "Bxe6", "Bxg5+", "Kh5", "Bf3+", "Bg4", "Bxg4+", "Kxg4", "Rf4+", "exf4", "Qxf4+", "Kh3", "Qg3#"]
  },
  {
    order: 269,
    fen: "1r3kr1/2qn1pp1/3Nb3/6Pp/8/Q4P2/PPP4P/2KRR3 w - - 0 0",
    solution: ["Nc8+", "Qc5", "Qxc5+", "Nxc5", "Rd8#"]
  },
  {
    order: 270,
    fen: "2r1kb1r/1p1R2pp/p3p3/1Q3p2/4N3/8/PPP2PpP/6K1 w k - 0 0",
    solution: ["Rxg7+", "axb5", "Nf6+", "Kd8", "Rd7#"]
  },
  {
    order: 271,
    fen: "1rr4k/5qp1/4R2p/p1p1R3/2P2P2/P1Q3P1/7P/6K1 w - - 0 0",
    solution: ["Rxh6+", "gxh6", "Re7+", "Kg8", "Rxf7", "Kxf7", "Qxa5"]
  },
  {
    order: 272,
    fen: "3r1rk1/2p1qp2/p5p1/1p1P3p/5b1P/P2P4/BP3P2/2RQ1KR1 w - - 0 0",
    solution: ["Rxg6+", "fxg6", "d6+", "Qf7", "Bxf7+"]
  },
  {
    order: 273,
    fen: "3r3k/p5qp/bp2B1p1/3P1p2/2n2N2/2R5/PQ3PPP/6K1 w - - 0 0",
    solution: ["Nxg6+", "Qxg6", "Rxc4+", "Qg7", "Qxg7+", "Kxg7", "Rc7+"]
  },
  {
    order: 274,
    fen: "2r2rk1/pp1qbppp/5n2/3p4/3P4/7Q/PP3PPP/RBB1R1K1 w - - 0 0",
    solution: ["Bxh7+", "Kh8", "Bf5+", "Kg8", "Bxd7"]
  },
  {
    order: 275,
    fen: "8/2n5/8/4k3/8/2N5/1B6/K7 w - - 0 0",
    solution: ["Nb5+", "Ke6", "Nxc7+"]
  },
  {
    order: 276,
    fen: "8/8/8/4q3/8/8/K1k2P1R/8 w - - 0 0",
    solution: ["f4+", "Kd3", "fxe5"]
  },
  {
    order: 277,
    fen: "8/8/3k4/8/4K3/6N1/5bpB/8 w - - 0 0",
    solution: ["Nh1+", "Ke7", "Nxf2"]
  },
  {
    order: 278,
    fen: "k5r1/3P4/2K5/8/1N6/8/6Bb/8 w - - 0 0",
    solution: ["Kb6+", "Rxg2", "d8=Q+", "Bb8", "Qd5#"]
  },
  {
    order: 279,
    fen: "r2qkb1r/ppp2ppp/3p4/8/3nB1b1/3P1N2/PPP1QPPP/R1B1K2R w KQkq - 0 0",
    solution: ["Bc6#"]
  },
  {
    order: 280,
    fen: "r7/qkp5/1np5/5n2/8/1N6/1Q2b1P1/6K1 b - - 0 0",
    solution: ["Nc4+", "Nc5+", "Kc8", "Qh8#"]
  },
  {
    order: 281,
    fen: "rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 0",
    solution: ["Qd8+", "Kxd8", "Bg5+", "Kc7", "Bd8#"]
  },
  {
    order: 282,
    fen: "1r4r1/pbpknp1p/1b3P2/8/8/B1PB1q2/P4PPP/3R2K1 w - - 0 0",
    solution: ["Bf5+", "Ke8", "Bd7+", "Kd8", "Bxe7#"]
  },
  {
    order: 283,
    fen: "r1b1knr1/pp2bp1p/1q6/5p2/4N3/8/PPPQBPPP/2KRR3 w q - 0 0",
    solution: ["Nf6+", "Bxf6", "Qd8+", "Qxd8", "Bb5#"]
  },
  {
    order: 284,
    fen: "5rk1/1bpn1p1p/1p1b1Qp1/p7/3N2r1/1P3Pq1/PBP5/7K w - - 0 0",
    solution: ["Qg7+", "Kxg7", "Nf5+", "Kg8", "Nh6#"]
  },
  {
    order: 285,
    fen: "rn1q1rk1/p2pb1pp/bp2p3/2pnN2Q/3PN3/3B4/PPPB1PPP/R3K2R w KQ - 0 0",
    solution: ["Qxh7+", "Kxh7", "Nf6+", "Kh8", "Ng6#"]
  },
  {
    order: 286,
    fen: "r1b1k1nr/ppp2ppp/3b1q2/2nP4/5p2/5N2/PPPPB1PP/RNBQR1K1 w kq - 0 0",
    solution: ["Bb5+", "Kd8", "Re8#"]
  },
  {
    order: 287,
    fen: "2r2r1k/2q3pB/7p/4N3/8/1PP4P/P1Q3P1/5R1K w - - 0 0",
    solution: ["Ng6+", "Kxh7", "Nxf8+", "Kg8", "Qh7#"]
  },
  {
    order: 288,
    fen: "r1b2rk1/1p4p1/p3p2p/3pR3/1P1Q1q2/3B2R1/P1P2PPP/6K1 w - - 0 0",
    solution: ["Rxg7+", "Kxg7", "Rg5+", "Kf7", "Rg7+", "Ke8", "Bg6+", "Rf7", "Qxf4"]
  },
  {
    order: 289,
    fen: "r5r1/ppk1B1R1/8/8/8/5P2/5KPP/8 w - - 0 0",
    solution: ["Bd8+", "Kxd8", "Rxg8+", "Ke7", "Rxa8"]
  },
  {
    order: 290,
    fen: "5k2/1b3pp1/7p/1N1q2r1/Q7/7P/5PP1/4R2K w - - 0 0",
    solution: ["Re8+", "Kxe8", "Nc7+", "Ke7", "Nxd5+"]
  },
  {
    order: 291,
    fen: "r1b2rk1/2qn1p1p/p1pbp1p1/2ppN3/5P2/1P2P2R/PBPP2PP/RN1Q2K1 w - - 0 0",
    solution: ["Qh5", "gxh5", "Rg3+", "Kh8", "Nxf7#"]
  },
  {
    order: 292,
    fen: "r2qk2r/pp1Npp1p/8/n1pP1p2/Q1P5/8/P2BBPPP/b3K2R w Kkq - 0 0",
    solution: ["Nf6+", "Kf8", "Bh6#"]
  },
  {
    order: 293,
    fen: "1k1r3r/ppR4p/6p1/3p4/4PB2/8/q1P2QPP/6K1 w - - 0 0",
    solution: ["Rc8+", "Kxc8", "Qc5+", "Kd7", "Qd6+", "Ke8", "Qe6+", "Kf8", "Bh6#"]
  },
  {
    order: 294,
    fen: "r1bqk2r/pp3ppp/5n2/8/3nNB2/3P4/PP1b2PP/1K2RBNR w kq - 0 0",
    solution: ["Nxf6+", "Kf8", "Bd6+", "Qe7", "Bxe7#"]
  },
  {
    order: 295,
    fen: "r2n1nk1/pb1P1pp1/1p2pR1p/q7/2PB2QP/3B4/6P1/3R3K w - - 0 0",
    solution: ["Qxg7+", "Kxg7", "Rg6+", "Kh7", "Rg7+", "Kh8", "Rh7+", "Kg8", "Rh8#"]
  },
  {
    order: 296,
    fen: "r1bqk2r/pppp1ppp/8/PB2N3/3n4/B7/2PPQnPP/RN2K2R w KQkq - 0 0",
    solution: ["Nxd7+", "Nxe2", "Nf6#"]
  },
  {
    order: 297,
    fen: "1k1r1bnr/1pR5/p3bp2/6pp/N3p3/PP3NBP/5PP1/3q1RK1 w - - 0 0",
    solution: ["Rc8+", "Ka7", "Bb8+", "Ka8", "Nb6#"]
  },
  {
    order: 298,
    fen: "4rrk1/1p3p1p/p3bRpQ/2p5/P4b2/3BP3/1BPP4/7K w - - 0 0",
    solution: ["Qg7+", "Kxg7", "Rxg6#"]
  },
  {
    order: 299,
    fen: "4rqk1/ppp2rp1/1b2b3/n5p1/4N1P1/3B4/PPP2P1Q/2KR4 w - - 0 0",
    solution: ["Qh7+", "Kxh7", "Nf6+", "Kh6", "Rh1#"]
  },
  {
    order: 300,
    fen: "r3k1nr/pppb2pp/6q1/2Q5/3pPB2/2P5/P5PP/RN3RK1 w kq - 0 0",
    solution: ["Qf8+", "Kxf8", "Bd6+", "Ke8", "Rf8#"]
  },
  {
    order: 301,
    fen: "r3r3/3q1pkp/p3bbp1/1pPp4/1P1Q4/P1N3PP/1BB2P1K/R7 w - - 0 0",
    solution: ["Qxf6+", "Kxf6", "Nxd5+", "Kg5", "Bc1+", "Kh5", "Nf6#"]
  },
  {
    order: 302,
    fen: "4b1k1/4r3/3q1Q2/1pb4p/p2pBN2/3P1RP1/1P5P/6K1 w - - 0 0",
    solution: ["Qf8+", "Kxf8", "Ne6+", "Kg8", "Rf8#"]
  },
  {
    order: 303,
    fen: "r3Rbk1/1p3p1p/2pq2p1/4Q3/2PNn3/1P5P/rB3PP1/5RK1 w - - 0 0",
    solution: ["Qg7+", "Kxg7", "Nf5+", "Kg8", "Nh6#"]
  },
  {
    order: 304,
    fen: "rn2kb1r/pp2pp1p/2p2p2/8/8/3Q4/qPPB1PPP/2KR3R w kq - 0 0",
    solution: ["Qd8+", "Kxd8", "Ba5+", "Kc8", "Rd8#"]
  },
  {
    order: 305,
    fen: "8/1k3p2/8/3r4/8/5B2/2P1K3/8 b - - 0 0",
    solution: ["Kc6", "c4"]
  },
  {
    order: 306,
    fen: "2R3nk/6q1/8/8/8/2B5/3Q3K/8 w - - 0 0",
    solution: ["Qh6#"]
  },
  {
    order: 307,
    fen: "6k1/5b2/8/6n1/6R1/8/2P5/3K4 b - - 0 0",
    solution: ["Bh5"]
  },
  {
    order: 308,
    fen: "r1bqkb1r/pppn1ppp/5n2/3p2B1/3P4/2N5/PP2PPPP/R2QKBNR w KQkq - 0 1",
    solution: ["Nxd5", "Nxd5", "Bxd8", "Bb4+", "Qd2", "Bxd2+", "Kxd2", "Kxd8"]
  },
  {
    order: 309,
    fen: "r1bqk2r/ppp1bppp/2np1n2/1B1Pp3/4P3/5N2/PPP2PPP/RNBQK2R b KQkq - 0 1",
    solution: ["a6", "Ba4", "b5", "Bb3", "Na5"]
  },
  {
    order: 310,
    fen: "8/p1r3n1/R1p2k2/4p3/8/1P2NPP1/P6P/6K1 w - - 0 0",
    solution: ["Nd5+", "Kg6", "Nxc7"]
  },
  {
    order: 311,
    fen: "2bq1rk1/5pbp/1npp2p1/2n5/2P1P3/1PN1B1PP/2Q2PB1/3R2K1 w - - 0 0",
    solution: ["Bxc5"]
  },
  {
    order: 312,
    fen: "2k5/2nq1pp1/p1Q1p3/P3PbPp/3P4/2R2P2/1P4PK/8 w - - 0 0",
    solution: ["Qa8#"]
  },
  {
    order: 313,
    fen: "8/8/p4p2/k1K5/p7/R7/1P4p1/5q2 w - - 0 0",
    solution: ["b4#"]
  },
  {
    order: 314,
    fen: "6k1/4qrp1/3p3Q/p1pB1p2/1pP4P/1P5P/P7/B1n4K w - - 0 0",
    solution: ["Qxg7#"]
  },
  {
    order: 315,
    fen: "4rkr1/1p1Rn1pp/p1p1p2B/5p2/3Q4/8/PPq1PPPP/3R2K1 w - - 0 0",
    solution: ["Qf6#"]
  },
  {
    order: 316,
    fen: "r2k4/1pp2rpp/pn3p2/3n4/8/P4NB1/1PP3PP/2KRR3 w - - 0 0",
    solution: ["c4", "Nxc4", "Rxd5+"]
  },
  {
    order: 317,
    fen: "6k1/q1pp2bp/8/8/8/8/PQ3P2/KR6 w - - 0 0",
    solution: ["Rg1", "Kf7", "Qxg7+"]
  },
  {
    order: 318,
    fen: "8/5rkp/5bp1/8/6PP/2B2R2/6K1/8 w - - 0 0",
    solution: ["Rxf6", "Rxf6", "g5"]
  },
  {
    order: 319,
    fen: "7r/1bk2q2/2p2p2/p1Q1pP1p/4P2P/2N3r1/PPPR4/2K5 w - - 0 0",
    solution: ["Nb5+", "Kb8", "Qa7+", "Kc8", "Nd6+", "Kd8", "Nxf7+"]
  },
  {
    order: 320,
    fen: "8/1n3k2/pb2p1p1/2p1Pp1p/1pP2P1P/1P1N2P1/P1K2B2/8 w - - 0 0",
    solution: ["Nxb4", "cxb4", "Bxb6"]
  },
  {
    order: 321,
    fen: "rn6/kp3p2/pq4p1/N1Q4p/8/P6P/5PP1/3R2K1 w - - 0 0",
    solution: ["Rb1", "Qxc5", "Rxb7#"]
  },
  {
    order: 322,
    fen: "3r2rk/p4p1p/3p1Pp1/3R4/2p1B2Q/8/1q4PP/4R1K1 w - - 0 0",
    solution: ["Qxh7+", "Kxh7", "Rh5#"]
  },
  {
    order: 323,
    fen: "3r2k1/1p5p/6p1/p2q1p2/P1Q5/1P5P/1P6/5RK1 w - - 0 0",
    solution: ["Rd1", "Qxc4", "Rxd8+", "Kg7", "bxc4"]
  },
  {
    order: 324,
    fen: "8/kp2q3/pR2r2r/1P1p4/P2P4/4Q2R/4K3/8 w - - 0 0",
    solution: ["Rxe6", "Rxe6", "b6+", "Kxb6", "Rh6", "Rxh6", "Qxe7"]
  },
  {
    order: 325,
    fen: "5r1k/4R3/p1pp4/3p1bQ1/3q1P2/7P/P2B2P1/7K w - - 0 0",
    solution: ["Qh4+", "Kg8", "Qg3+", "Kh8", "Bc3"]
  },
  {
    order: 326,
    fen: "r4k2/pp3ppp/1q2p1b1/2r1P3/Q7/8/PP2BPPP/2R2RK1 w - - 0 0",
    solution: ["Qa3", "Rac8", "Rxc5", "Qxc5", "Rc1", "Qxa3", "Rxc8+", "Ke7", "bxa3"]
  },
  {
    order: 327,
    fen: "2r5/1p1bkp2/p2q1p2/3Pp3/7Q/1B6/P1P3PP/1K3R2 w - - 0 0",
    solution: ["Rxf6", "Qxf6", "d6+", "Kxd6", "Qxf6+"]
  },
  {
    order: 328,
    fen: "8/2p1P3/2p5/p2b3p/6B1/1k2rR2/1P4K1/8 w - - 0 0",
    solution: ["Be6", "Rxf3", "Bxd5+", "cxd5", "Kxf3"]
  },
  {
    order: 329,
    fen: "3r3k/p1p1qp2/1pQ1pPpp/8/8/8/PPP2PPP/3R2K1 w - - 0 0",
    solution: ["Qa8", "Qxf6", "Qxd8+", "Qxd8", "Rxd8+"]
  },
  {
    order: 330,
    fen: "4Rrk1/3P2pp/p2q4/1p6/3p4/P7/1PP3P1/1K1R4 w - - 0 0",
    solution: ["Rf1", "Qxd7", "Rfxf8#"]
  },
  {
    order: 331,
    fen: "3r1r1k/pp5p/2p3pQ/1q2n3/4P3/2B5/PPP5/2KRR3 w - - 0 0",
    solution: ["Rd5", "Qxd5", "exd5"]
  },
  {
    order: 332,
    fen: "6k1/r6p/pp1p2p1/2pP2q1/P1Pb4/4B3/1P1Q2PP/5RK1 w - - 0 0",
    solution: ["Qxd4", "cxd4", "Bxg5"]
  },
  {
    order: 333,
    fen: "r2qkbnr/pp2pppp/8/3p4/3n2b1/5N2/PPPN1PPP/R1BQKB1R w KQkq - 0 0",
    solution: ["Nxd4", "Bxd1", "Bb5+", "Qd7", "Bxd7+", "Kxd7", "Kxd1"]
  },
  {
    order: 334,
    fen: "k1K5/b7/8/1P6/4R3/3n4/8/8 w - - 0 0",
    solution: ["Ra4", "Nc5", "b6", "Nxa4", "b7#"]
  },
  {
    order: 335,
    fen: "r3kb1r/2pn1p1p/p3p1p1/1P1q2NQ/2pP4/2P3P1/5P1P/R1B1R1K1 w kq - 0 1",
    solution: ["Nxe6", "Qxe6", "Rxe6+"]
  },
  {
    order: 336,
    fen: "8/p1r5/R1p3k1/8/1P2p3/8/1P3PP1/6K1 w - - 0 0",
    solution: ["b5", "Kf7", "bxc6"]
  },
  {
    order: 337,
    fen: "3b1q1k/6rp/2p4Q/p2pP3/3P1N2/1P4B1/P5K1/8 w - - 0 0",
    solution: ["Ng6+", "Rxg6", "Qxf8+", "Rg8", "Qd6"]
  },
  {
    order: 338,
    fen: "2r3k1/3b2pp/1pp1r3/p2p1p2/Pq3P2/1PRQP1P1/6BP/2R3K1 w - - 0 0",
    solution: ["Bxd5", "cxd5", "Rxc8+", "Bxc8", "Rxc8+"]
  },
  {
    order: 339,
    fen: "6k1/6pp/2q2p2/2brp3/P3Q3/4B1P1/5P1P/4R1K1 w - - 0 0",
    solution: ["Qc4", "Qd6", "Rd1", "Bd4", "Bxd4", "Kf8"]
  },
  {
    order: 340,
    fen: "8/8/2kB4/3n4/4K3/5B2/8/8 w - - 0 0",
    solution: ["Ke5", "Kb5", "Bxd5"]
  },
  {
    order: 341,
    fen: "r1bk1r2/1ppp3p/p3n3/2qNP3/8/5Q2/PPP1B2P/2K2RR1 w - - 0 0",
    solution: ["Rg8", "Rxg8", "Qf6+", "Ke8", "Qf7+", "Kd8", "Qxg8+", "Nf8", "Rxf8+", "Qxf8", "Qxf8#"]
  },
  {
    order: 342,
    fen: "8/p1Rb2k1/1p1r1ppp/3P4/4rN2/8/P5P1/2R3K1 w - - 0 0",
    solution: ["R1c6", "Rxc6", "dxc6", "Rxf4", "Rxd7+", "Kf8", "c7", "Rc4", "Rd8+", "Ke7", "c8=Q", "Rxc8", "Rxc8"]
  },
  {
    order: 343,
    fen: "8/5q2/k4r1R/8/2p1Q3/8/2K5/8 w - - 0 0",
    solution: ["Qf5", "Rxh6", "Qxf7"]
  },
  {
    order: 344,
    fen: "5nk1/3q2pp/1p2n3/p1bQP3/Pp1p4/3N4/1B4PP/5R1K w - - 0 0",
    solution: ["Rxf8+", "Kxf8", "Qxd7"]
  },
  {
    order: 345,
    fen: "r1b1qrk1/pp1p1pp1/5P1p/n3p2Q/2B5/8/8/6K1 w - - 0 0",
    solution: ["Qg6", "Nxc4", "Qxg7#"]
  },
  {
    order: 346,
    fen: "2q5/8/8/5k2/8/8/3K4/5B2 w - - 0 0",
    solution: ["Bh3+", "Ke4", "Bxc8"]
  },
  {
    order: 347,
    fen: "8/1r6/1P6/3k3r/8/K1p5/4PPB1/2B5 b - - 0 0",
    solution: ["Kc4", "Bxb7", "Ra5#"]
  },
  {
    order: 348,
    fen: "7R/r4k2/8/8/8/8/6K1/8 w - - 0 0",
    solution: ["Rh7+", "Kf6", "Rxa7"]
  },
  {
    order: 349,
    fen: "8/P7/1K6/8/8/5k2/8/7q w - - 0 0",
    solution: ["a8=Q+", "Ke3", "Qxh1"]
  },
  {
    order: 350,
    fen: "2r5/1R2bPk1/5pp1/8/p1B5/8/5r2/2K4R w - - 0 0",
    solution: ["f8=Q+", "Kxf8", "Rh8+", "Kg7", "Rxc8"]
  },
  {
    order: 351,
    fen: "1R4B1/3r2k1/5p1b/7p/1P6/3n4/1r3P1P/R3N1K1 w - - 0 0",
    solution: ["Nxd3", "Rxd3", "Ra7+", "Kg6", "Bh7+", "Kg5", "Bxd3"]
  },
  {
    order: 352,
    fen: "q3N3/8/7p/7K/4kp2/1pQ5/8/8 w - - 0 0",
    solution: ["Nd6+", "Kd5", "Qf3+", "Kxd6", "Qxa8"]
  },
  {
    order: 353,
    fen: "rn3b1r/pQpk2p1/2qnppB1/8/6PP/2N1B3/PPP2P2/2KR3R w - - 0 0",
    solution: ["Be4", "Qxb7", "Bxb7", "Nc6", "Bxa8"]
  },
  {
    order: 354,
    fen: "3Q4/5knp/1nN3p1/2p5/5P2/1q6/1P4PP/6K1 w - - 0 0",
    solution: ["Ne5+", "Ke6", "Qg8+", "Kf5", "Qxb3"]
  },
  {
    order: 355,
    fen: "1q4k1/4pR2/pn2r1p1/6P1/8/P1P2Q2/KP5P/8 w - - 0 0",
    solution: ["Qh3", "Kxf7", "Qh7+", "Kf8", "Qh8+", "Kf7", "Qxb8"]
  },
  {
    order: 356,
    fen: "1b6/5k2/6p1/3K4/5p2/5P1R/8/8 w - - 0 1",
    solution: ["Rh8", "Bc7", "Rh7+", "Kf6", "Rxc7"]
  },
  {
    order: 357,
    fen: "5kb1/8/8/4K3/8/8/8/2R5 w - - 0 0",
    solution: ["Kf6", "Ke8", "Rc8+", "Kd7", "Rxg8"]
  },
  {
    order: 358,
    fen: "3r2k1/2q3pp/2p2p2/8/2Pp1P1n/1P6/P2B2PP/2Q2R1K w - - 0 0",
    solution: ["Qe1", "Ng6", "Ba5", "Qd7", "Bxd8"]
  },
  {
    order: 359,
    fen: "7K/6P1/4k3/8/7Q/p1q5/8/8 w - - 0 0",
    solution: ["Qc4+", "Qxc4", "g8=Q+", "Kd6", "Qxc4"]
  },
  {
    order: 360,
    fen: "7k/B7/6pp/4br2/3pR3/3P4/6PP/6K1 w - - 0 0",
    solution: ["Rxe5", "Rxe5", "Bxd4", "Kh7", "Bxe5"]
  },
  {
    order: 361,
    fen: "r4k2/6p1/7p/2p1p3/3rb1B1/1P5P/6PK/2R1R3 w - - 0 0",
    solution: ["Rxe4", "Rxe4", "Bf3", "Rd4", "Bxa8"]
  },
  {
    order: 362,
    fen: "7K/6P1/8/6k1/3q4/8/8/5Q2 w - - 0 0",
    solution: ["Qg1+", "Qxg1", "g8=Q+", "Kf4", "Qxg1"]
  },
  {
    order: 363,
    fen: "1bb2rk1/r4ppp/p2q1n2/1p6/3pP2B/1N1P1P2/1P1N2PP/2RQ1R1K w - - 0 0",
    solution: ["e5", "Qxe5", "Bg3", "Qe7", "Bxb8"]
  },
  {
    order: 364,
    fen: "1kr5/R1p5/1P6/8/8/8/8/2K5 w - - 0 0",
    solution: ["b7", "Rh8", "Ra8+", "Kxb7", "Rxh8"]
  },
  {
    order: 365,
    fen: "7Q/8/3k4/2Np4/4p1K1/8/3q4/8 w - - 0 0",
    solution: ["Nxe4+", "dxe4", "Qd8+", "Ke5", "Qxd2"]
  },
  {
    order: 366,
    fen: "2Q5/1p4q1/p4k2/6p1/P3b3/6BP/5PP1/6K1 w - - 0 0",
    solution: ["Be5+", "Kxe5", "Qc3+", "Kf4", "Qxg7"]
  },
  {
    order: 367,
    fen: "8/8/1p2p2P/1k2K3/8/pPP5/8/8 w - - 0 0",
    solution: ["h7", "a2", "h8=Q", "a1=Q", "Qe8+", "Kc5", "Qc8+", "Kb5", "Qc4+", "Ka5", "b4+", "Ka4", "Qa6+", "Kb3", "Qxa1"]
  },
  {
    order: 368,
    fen: "8/1q1k4/1Pp3p1/3pPp1p/5P2/6P1/1Q5K/8 w - - 0 0",
    solution: ["e6+", "Kxe6", "Qe5+", "Kf7", "Qc7+", "Qxc7", "bxc7", "Ke6", "c8=Q+"]
  },
  {
    order: 369,
    fen: "5r1k/6pp/3p4/3Pn3/8/6NP/5qP1/1Q1R3K w - - 0 0",
    solution: ["Rf1", "Qxf1+", "Nxf1"]
  },
  {
    order: 370,
    fen: "4k2r/5p2/2p5/4q2p/8/4B1PP/2P2Q2/6K1 w k - 0 0",
    solution: ["Bd4", "Qd5", "Bxh8"]
  },
  {
    order: 371,
    fen: "1rb3k1/p1q2p1p/1p4p1/8/8/2P1BB2/1P1Q2P1/2K5 w - - 0 0",
    solution: ["Bf4", "Qe7", "Bxb8"]
  },
  {
    order: 372,
    fen: "3qrr1k/6p1/3p2P1/3N1p2/4pQ2/7P/8/2R4K w - - 0 0",
    solution: ["Rc8", "Qxc8", "Qh4+", "Kg8", "Qh7#"]
  },
  {
    order: 373,
    fen: "1r1q2rk/7p/7Q/8/2b2P2/6RP/6PK/4R3 w - - 0 0",
    solution: ["Re8", "Qxe8", "Qf6+", "Rg7", "Qxg7#"]
  },
  {
    order: 374,
    fen: "4kb1r/p4ppp/qp2p3/3rN1B1/3Q4/1P6/1P3PPP/2R3K1 w k - 0 0",
    solution: ["Qa4+", "Qb5", "Rc8+", "Rd8", "Rxd8#"]
  },
  {
    order: 375,
    fen: "1k6/1Pr5/K1nR1p2/4p3/4P3/4BP2/8/8 w - - 0 0",
    solution: ["Rd8+", "Nxd8", "Ba7#"]
  },
  {
    order: 376,
    fen: "2B5/8/5K2/4Q3/8/5k2/8/1r5q w - - 0 0",
    solution: ["Bb7+", "Rxb7", "Qd5+", "Ke3", "Qxh1"]
  },
  {
    order: 377,
    fen: "6b1/1p3q1k/7p/6pP/4p1B1/P1BnP1Q1/1P4P1/6K1 w - - 0 0",
    solution: ["Qc7", "Qxc7", "Bf5#"]
  },
  {
    order: 378,
    fen: "5r1k/1p4pp/8/1P5Q/r2Bq3/6P1/n4P1P/2R3K1 w - - 0 0",
    solution: ["Qf7", "Rg8", "Rc8", "Rxc8", "Qxg7#"]
  },
  {
    order: 379,
    fen: "r3bk2/1p2b3/2n2q2/p2B2p1/2Pp4/PP3QP1/5P1P/2B1R1K1 w - - 0 0",
    solution: ["Bxg5", "Qxf3", "Bh6#"]
  },
  {
    order: 380,
    fen: "4k3/3pPpK1/3P1Pb1/8/8/8/B7/8 w - - 0 0",
    solution: ["Be6", "dxe6", "d7+", "Kxd7", "Kf8", "e5", "e8=Q+"]
  },
  {
    order: 381,
    fen: "r4r2/pp3p1N/4q3/2p1n1p1/4P1k1/3p2P1/PPP3KR/5R2 w - - 0 1",
    solution: ["Rf4+", "gxf4", "Rh4#"]
  },
  {
    order: 382,
    fen: "5rk1/pp1q2p1/2p3Qp/2Pb1p2/r3n3/P3P3/1B2BPPP/3R1RK1 w - - 0 0",
    solution: ["Rxd5", "cxd5", "Bb5", "Qf7", "Qxf7+", "Rxf7", "Bxa4"]
  },
  {
    order: 383,
    fen: "r4r1k/p2p3p/3N2RP/3q4/6Q1/8/P1P2PPK/8 w - - 0 0",
    solution: ["Rg8+", "Rxg8", "Qd4+", "Qxd4", "Nf7#"]
  },
  {
    order: 384,
    fen: "2Q5/1R6/5q1k/3rnpp1/1P2p3/6P1/4BPK1/8 w - - 0 0",
    solution: ["Rb6", "Qxb6", "Qh8+", "Kg6", "Bh5#"]
  },
  {
    order: 385,
    fen: "k1n5/p2R2bb/2p2qpp/4rp2/2P5/4Q1P1/PP3PBP/6K1 w - - 0 0",
    solution: ["Qxe5", "Qxe5", "Bxc6+", "Kb8", "Rb7+", "Ka8", "Rb6#"]
  },
  {
    order: 386,
    fen: "5r1k/ppq2ppp/2p4N/4b3/8/6Q1/PPP2PPP/3R2K1 w - - 0 0",
    solution: ["Qxe5", "Qxe5", "Nxf7+", "Kg8", "Nxe5"]
  },
  {
    order: 387,
    fen: "2rr4/pq2k1Bp/1p2nN2/2b2p1Q/8/1P6/3R1PPP/3R2K1 w - - 0 0",
    solution: ["Qe8+", "Rxe8", "Rd7+", "Qxd7", "Rxd7#"]
  },
  {
    order: 388,
    fen: "2Q5/1p3p1k/p2prPq1/8/7p/8/PP3RP1/6K1 w - - 0 0",
    solution: ["Qxe6", "fxe6", "f7", "Qxf7", "Rxf7+"]
  },
  {
    order: 389,
    fen: "8/R7/1P6/1k6/8/2K5/8/1r6 w - - 0 0",
    solution: ["Ra1", "Rxa1", "b7", "Kc5", "b8=Q"]
  },
  {
    order: 390,
    fen: "8/p4pbp/1p4p1/2p1Pk2/5P2/P1B2K2/1P3P1P/8 w - - 0 0",
    solution: ["e6", "fxe6", "Bxg7"]
  },
  {
    order: 391,
    fen: "6rk/6b1/6Qp/8/5P2/p5P1/q5PK/6B1 w - - 0 0",
    solution: ["Bd4", "Bxd4", "Qxh6#"]
  },
  {
    order: 392,
    fen: "5R2/1p5k/2r4b/4p2P/p2pN1p1/P2P2P1/4q3/5R1K w - - 0 0",
    solution: ["Ng5+", "Bxg5", "R1f7+", "Kh6", "Rh8#"]
  },
  {
    order: 393,
    fen: "7k/pp2n3/4PP1r/2p3R1/3p4/P7/1PP4P/7K w - - 0 0",
    solution: ["Rh5", "Rxh5", "fxe7", "Re5", "e8=Q+"]
  },
  {
    order: 394,
    fen: "r3k2r/pp1n1ppp/2p1p3/5b2/PbNPq3/2N5/1P1K2PP/R1BQ1B1R w kq - 0 0",
    solution: ["Nd6+", "Bxd6", "Nxe4"]
  },
  {
    order: 395,
    fen: "8/5pp1/7k/1p2RQ1P/3q1p2/P7/3r1PP1/6K1 w - - 0 0",
    solution: ["Re6+", "Qf6", "Rxf6+"]
  },
  {
    order: 396,
    fen: "4kb1r/2Rn1b2/q4p1p/4pNp1/3pPP2/3P2PP/1P4B1/3QN1K1 w k - 0 0",
    solution: ["Qa4", "Qxa4", "Rc8#"]
  },
  {
    order: 397,
    fen: "r1b3k1/ppq2ppp/2n5/8/1Q2N3/4B3/PPP3PP/2K1R3 w - - 0 0",
    solution: ["Nf6+", "gxf6", "Qf8+", "Kxf8", "Bh6+", "Kg8", "Re8#"]
  },
  {
    order: 398,
    fen: "4q1k1/8/5P2/5N2/8/7P/6P1/6K1 w - - 0 0",
    solution: ["f7+", "Kxf7", "Nd6+", "Kf8", "Nxe8"]
  },
  {
    order: 399,
    fen: "8/k7/1q6/8/8/N1B5/1P6/1K6 w - - 0 0",
    solution: ["Bd4", "Qxd4", "Nb5+", "Kb7", "Nxd4"]
  },
  {
    order: 400,
    fen: "r7/3q1k1p/p4p2/1p2p1p1/8/1P6/P5PP/1QR4K w - - 0 0",
    solution: ["Rc7", "Qxc7", "Qxh7+", "Ke6", "Qxc7"]
  },
  {
    order: 401,
    fen: "2q3k1/6p1/r3pn2/3p4/3b1NP1/1p1Q4/1P1B1P2/1K5R w - - 0 0",
    solution: ["Rh8+", "Kxh8", "Ng6+", "Kg8", "Ne7+", "Kf7", "Nxc8"]
  },
  {
    order: 402,
    fen: "6k1/1p3p2/p6p/5Np1/5q2/Q6P/PPr5/3R3K w - - 0 0",
    solution: ["Qf8+", "Kxf8", "Rd8#"]
  },
  {
    order: 403,
    fen: "8/p2q1r1k/2b2B1p/5P2/8/P7/R2Q4/6K1 w - - 0 0",
    solution: ["Qxh6+", "Kg8", "Qh8#"]
  },
  {
    order: 404,
    fen: "6r1/2q5/1p1k2p1/2pp3p/8/1P4PP/PB4P1/2Q3K1 w - - 0 0",
    solution: ["Be5+", "Kxe5", "Qf4+", "Ke6", "Qxc7"]
  },
  {
    order: 405,
    fen: "r1b2rk1/pp4p1/2p4n/2Qp1pq1/3P1N1n/3BP1N1/PP3PP1/1K1R3R w - - 0 0",
    solution: ["Rxh4", "Qxh4", "Qxf8+", "Kxf8", "Ng6+", "Kg8", "Nxh4"]
  },
  {
    order: 406,
    fen: "3r2k1/pR3p2/2n3pQ/2Bp4/P2P3K/5R1P/4r1q1/8 w - - 0 0",
    solution: ["Qg7+", "Kxg7", "Rfxf7+", "Kg8", "Rg7+", "Kh8", "Rh7+", "Kg8", "Rbg7#"]
  },
  {
    order: 407,
    fen: "r1b1kb1r/ppp2ppp/2n2n2/6B1/Q3q3/8/PPP2PPP/2KR1BNR w kq - 0 0",
    solution: ["Rd8+", "Kxd8", "Qxe4"]
  },
  {
    order: 408,
    fen: "8/qp4kp/2p3p1/3n4/1B5P/5PPK/r7/2Q1R3 w - - 0 0",
    solution: ["Qh6+", "Kxh6", "Bf8+", "Kh5", "g4#"]
  },
  {
    order: 409,
    fen: "2r4k/7p/1Qq2pnP/p4p2/r2pP3/6R1/5PP1/3R2K1 w - - 0 0",
    solution: ["Rc3", "dxc3", "Rd8+", "Rxd8", "Qxd8+", "Qe8", "Qxf6+", "Kg8", "Qg7#"]
  },
  {
    order: 410,
    fen: "r6r/2qkb3/1n2p1Q1/3pP1Pp/1p1P4/1p2B3/1P3RBP/5NK1 w - - 0 0",
    solution: ["Qxe6+", "Ke8"]
  },
  {
    order: 411,
    fen: "r1b1k2r/b1qpn2p/p5p1/4p3/1p1N1B2/1BPQ4/PP4PP/2KR1R2 w kq - 0 0",
    solution: ["Bf7+", "Kxf7", "Bxe5+", "Kg8", "Bxc7"]
  },
  {
    order: 412,
    fen: "2r1r1k1/1b3pp1/1n4p1/p1p1p3/1pB1P3/1P3NP1/P4PK1/R6R w - - 0 0",
    solution: ["Rh8+", "Kxh8", "Bxf7", "Rf8", "Rh1#"]
  },
  {
    order: 413,
    fen: "r2r4/1p1R3p/5p1k/b1B1Pp2/p4P2/P7/1P5P/1K4R1 w - - 0 0",
    solution: ["Bf8+", "Rxf8", "Rd3", "Rg8", "Rh3#"]
  },
  {
    order: 414,
    fen: "1brqr1k1/pp3pp1/4n2p/3Np3/QP2P3/P6P/3N1PP1/2R2RK1 w - - 0 0",
    solution: ["Qxe8+", "Qxe8", "Rxc8", "Qxc8", "Ne7+", "Kh7", "Nxc8"]
  },
  {
    order: 415,
    fen: "2r1q1k1/p4ppp/2n5/1p1N4/6Q1/1P4P1/Pb4BP/2R4K w - - 0 0",
    solution: ["Qxc8", "Qxc8", "Rxc6", "Qxc6", "Ne7+", "Kf8", "Nxc6"]
  },
  {
    order: 416,
    fen: "8/2Q4p/3nkp2/1p6/3Pq3/8/4N1PP/6K1 w - - 0 0",
    solution: ["d5+", "Ke5", "Qe7+", "Kxd5", "Nc3+", "Kd4", "Nxe4"]
  },
  {
    order: 417,
    fen: "r3rnk1/ppq2ppp/5n2/2bp1N2/8/2N2Q2/PPP2PPP/R1B2RK1 w - - 0 0",
    solution: ["Nxg7", "Kxg7", "Qxf6+", "Kxf6", "Nxd5+", "Kg6", "Nxc7", "Rad8", "Nxe8"]
  },
  {
    order: 418,
    fen: "1n6/2qb1kp1/1p2pp1p/1P1p4/1Q1P1N2/4P1PB/5P1P/6K1 w - - 0 0",
    solution: ["Bxe6+", "Bxe6", "Qf8+", "Kxf8", "Nxe6+", "Ke7", "Nxc7"]
  },
  {
    order: 419,
    fen: "r4r2/6kp/2pqppp1/pbR5/3P4/4QN2/PP3PPP/2R3K1 w - - 0 0",
    solution: ["a4", "Bxa4", "Qa3", "Bb5", "Rxb5", "Qxa3", "Rb7+", "Rf7", "Rxf7+", "Kxf7", "bxa3"]
  },
  {
    order: 420,
    fen: "r1bqr1k1/pppnbppp/2np4/8/2BNP3/2N4P/PPP2PP1/R1BQR1K1 w - - 0 0",
    solution: ["Bxf7+", "Kxf7", "Ne6", "Kg8", "Nxd8"]
  },
  {
    order: 421,
    fen: "rn3rk1/pbppq1pp/1p2pb2/4N2Q/3PN3/3B4/PPP2PPP/R3K2R w KQ - 0 0",
    solution: ["Qxh7+", "Kxh7", "Nxf6+", "Kh8", "Ng6#"]
  },
  {
    order: 422,
    fen: "4rnk1/2qn2p1/p3b2p/1pp1N3/2P5/4P1Q1/PB4PP/1B3RK1 w - - 0 0",
    solution: ["Qxg7+", "Kxg7", "Nxd7+", "Kg8", "Nf6+", "Kf7", "Nd5+", "Kg8", "Nxc7"]
  },
  {
    order: 423,
    fen: "r1b1k2r/pp1n3p/2p4q/3pN1p1/3PpP2/2N1P3/PP4PP/R2Q1RK1 w kq - 0 0",
    solution: ["Nf7", "Kxf7", "fxg5+", "Kg7", "gxh6+"]
  },
  {
    order: 424,
    fen: "6k1/1p3p2/p2prPq1/8/7p/2Q5/PP4P1/5RK1 w - - 0 0",
    solution: ["Qc8+", "Kh7", "Qxe6", "fxe6", "f7", "h3", "f8=N+", "Kg7", "Nxg6"]
  },
  {
    order: 425,
    fen: "8/4p3/5p2/3P4/1P3k2/8/8/7K w - - 0 0",
    solution: ["d6", "exd6", "b5", "Ke5", "b6", "d5", "b7", "Kd6", "b8=Q+"]
  },
  {
    order: 426,
    fen: "6k1/5pp1/8/B2n4/5P2/P5Pp/4KQ2/7q w - - 0 0",
    solution: ["Qf3", "Qxf3+", "Kxf3", "Ne3", "Kxe3", "h2", "Kf2", "h1=Q"]
  },
  {
    order: 427,
    fen: "6R1/2pk4/P2p4/1P3p2/8/8/r4PK1/8 w - - 0 0",
    solution: ["b6", "cxb6", "a7", "Rxa7", "Rg7+", "Kc6", "Rxa7"]
  },
  {
    order: 428,
    fen: "6k1/3qrp2/6p1/1P6/1Q6/5P2/3p2PP/3R2K1 b - - 0 1",
    solution: ["Re1+", "Rxe1", "Qd4+", "Qxd4", "dxe1=Q#"]
  },
  {
    order: 429,
    fen: "5k2/NP3pp1/3p4/7p/P2Pp1bP/1r2P1P1/3K1P2/8 w - - 0 0",
    solution: ["Nb5", "Rxb5", "axb5", "Ke7", "b8=Q"]
  },
  {
    order: 430,
    fen: "8/1P6/k7/p7/K7/8/8/8 w - - 0 0",
    solution: ["b8=R"]
  },
  {
    order: 431,
    fen: "B2k4/P6r/3P4/8/2p5/8/8/2K5 w - - 0 0",
    solution: ["Bb7", "Rxb7", "a8=Q+", "Kd7", "Qxb7+"]
  },
  {
    order: 432,
    fen: "8/k7/1b3P2/8/8/8/1B4K1/8 w - - 0 0",
    solution: ["f7", "Bc5", "Bd4", "Bxd4", "f8=Q"]
  },
  {
    order: 433,
    fen: "1N6/2k5/P7/8/8/8/8/1K6 w - - 0 0",
    solution: ["Nd7", "Kc8", "Nc5", "Kc7", "Kb2", "Kb6", "Kb3", "Ka7", "Kb4", "Kb6", "Ka4", "Ka7", "Kb5", "Ka8", "Kb6", "Kb8", "Ne6", "Ka8", "Nc7+", "Kb8", "a7+", "Kc8", "a8=Q+"]
  },
  {
    order: 434,
    fen: "1k3r2/pp3rpp/1P6/P7/8/8/2R2PPP/2R3K1 w - - 0 0",
    solution: ["Rc8+", "Rxc8", "Rxc8+", "Kxc8", "bxa7", "Kc7", "a8=Q"]
  },
  {
    order: 435,
    fen: "8/p7/Pp4R1/8/1n4K1/8/8/1k6 w - - 0 0",
    solution: ["Rxb6", "axb6", "a7", "Nc6", "a8=Q"]
  },
  {
    order: 436,
    fen: "8/5k2/7P/8/8/5K2/2B5/8 w - - 0 0",
    solution: ["Bh7", "Kf8", "Kg4", "Kf7", "Kg5", "Kf8", "Kg6", "Ke7", "Bg8", "Kf8", "h7", "Ke7", "h8=Q"]
  },
  {
    order: 437,
    fen: "1k3K2/pPr5/P7/8/5B2/6p1/8/8 w - - 0 0",
    solution: ["Ke8", "g2", "Kd8", "g1=Q", "Bxc7#"]
  },
  {
    order: 438,
    fen: "4k3/p3r3/1pP1R1p1/7p/8/6P1/P4P1P/6K1 w - - 0 0",
    solution: ["c7", "Kd7", "Rxe7+", "Kc8"]
  },
  {
    order: 439,
    fen: "3Q4/p3b1k1/2p2rPp/2q5/4B3/P2P4/7P/6RK w - - 0 0",
    solution: ["Qh8+", "Kxh8", "g7+", "Kg8", "Bh7+", "Kxh7", "g8=Q#"]
  },
  {
    order: 440,
    fen: "4k3/4pp2/pPp3p1/P2RP2p/r4P2/5K1P/6P1/8 w - - 0 0",
    solution: ["Rb5", "axb5", "b7", "Rxa5", "b8=Q+"]
  },
  {
    order: 441,
    fen: "1k6/ppp3pp/4P1n1/8/8/1P4bP/P5P1/5R1K w - - 0 0",
    solution: ["Rf8+", "Nxf8", "e7", "Ng6", "e8=Q#"]
  },
  {
    order: 442,
    fen: "5nk1/pp4pp/1n3p2/P7/2q5/1QN3BP/1P2PPP1/7K w - - 0 0",
    solution: ["axb6", "Qxb3", "bxa7", "Qxb2", "a8=Q", "Qxc3", "Bd6", "Kf7", "Qxf8+"]
  },
  {
    order: 443,
    fen: "2r1k3/ppP1r1pp/3R4/5R2/8/6P1/P4PP1/6K1 w - - 0 0",
    solution: ["Rd8+", "Rxd8", "Rf8+", "Kxf8", "cxd8=Q+"]
  },
  {
    order: 444,
    fen: "8/6P1/8/8/5N2/7p/7p/4K2k w - - 0 0",
    solution: ["g8=B", "Kg1", "Ne2+", "Kg2", "Bd5#"]
  },
  {
    order: 445,
    fen: "8/2k3p1/1pp2p2/4pn1P/5r1P/1PP5/2P5/2K3RR w - - 0 0",
    solution: ["Rxg7+", "Nxg7", "h6", "Rg4", "h7", "Nf5", "h8=Q"]
  },
  {
    order: 446,
    fen: "8/8/p4kpP/5p2/b2N4/8/5PP1/6K1 w - - 0 0",
    solution: ["Ne6", "Kxe6", "h7", "Kf7", "h8=Q"]
  },
  {
    order: 447,
    fen: "6k1/5p2/2p1P1n1/3P4/8/8/8/1K6 w - - 0 0",
    solution: ["e7", "Nxe7", "d6", "Nc8", "d7", "Nd6", "d8=Q+"]
  },
  {
    order: 448,
    fen: "5rk1/ppp3p1/4p1P1/P5N1/3P4/6K1/1Pr5/7R w - - 0 0",
    solution: ["Nf7", "Rxf7", "Rh8+", "Kxh8", "gxf7", "Rxb2", "f8=Q+"]
  },
  {
    order: 449,
    fen: "8/1p6/6k1/2R5/p7/8/PPP2pP1/7K w - - 0 0",
    solution: ["Rf5", "Kxf5", "g4+", "Kxg4", "Kg2", "f1=Q+", "Kxf1"]
  },
  {
    order: 450,
    fen: "8/8/5p1p/5P1P/4k1P1/2p5/4K3/8 w - - 0 0",
    solution: ["g5", "Kxf5", "gxh6", "Kg5", "h7", "Kxh5", "h8=Q+"]
  },
  {
    order: 451,
    fen: "3qk1r1/pb1pppQp/1p3n2/2r1P3/2P5/1P3P2/P2BB2P/N3K2R w K - 0 0",
    solution: ["exf6", "Rxg7", "fxg7", "e6", "g8=Q+"]
  },
  {
    order: 452,
    fen: "r1b1k2r/pp2qpp1/1P4np/2p1p3/1nB1P3/Q2PBN2/1P3PPP/R3K2R w KQkq - 0 0",
    solution: ["Qxa7", "Rxa7", "bxa7", "Nc2+", "Kd2", "Nxa1", "a8=Q"]
  },
  {
    order: 453,
    fen: "3q4/5pPk/p3p2P/8/8/1Pp2P2/P1P5/1K4Q1 w - - 0 0",
    solution: ["g8=Q+", "Qxg8", "Qxg8+", "Kxg8", "b4"]
  },
  {
    order: 454,
    fen: "7k/p4q1p/3b1Pp1/1p4P1/3B1n2/P2P3P/1PP2P2/2K1R3 w - - 0 0",
    solution: ["Re8+", "Qxe8", "f7+", "Be5", "Bxe5+", "Qxe5", "f8=Q#"]
  },
  {
    order: 455,
    fen: "r2qkbn1/pp3ppr/2p3P1/3p4/Q3b3/2P5/PP2PPP1/RNB1KB2 w Qq - 0 0",
    solution: ["gxh7", "Nf6", "h8=Q"]
  },
  {
    order: 456,
    fen: "6K1/8/7p/8/k7/2B5/1P6/8 w - - 0 0",
    solution: ["Kf7", "h5", "Ke6", "h4", "Kd5", "Kb5", "Ke4", "h3", "Kf3", "h2", "Kg2", "h1=Q+", "Kxh1"]
  },
  {
    order: 457,
    fen: "k7/1qP5/1P6/KP6/8/7B/7p/8 w - - 0 0",
    solution: ["Bg2", "h1=Q", "Bxh1", "Qxh1", "c8=Q#"]
  },
  {
    order: 458,
    fen: "8/p1kP3p/4K1p1/2N2p2/1n6/8/6PP/8 w - - 0 0",
    solution: ["Na6+", "Nxa6", "Ke7", "Nc5", "d8=Q+"]
  },
  {
    order: 459,
    fen: "8/1n6/3k4/P7/8/8/8/K7 w - - 0 0",
    solution: ["a6", "Na5", "a7", "Nb3+", "Kb2", "Nd4", "a8=Q"]
  },
  {
    order: 460,
    fen: "8/p4p2/5k1P/1p2N1p1/2p1P1K1/2P5/PP6/2b5 w - - 0 0",
    solution: ["Kh5", "g4", "Nxg4+", "Ke7", "h7", "Bxb2", "h8=Q"]
  },
  {
    order: 461,
    fen: "6b1/6K1/7P/6k1/8/8/7P/8 w - - 0 0",
    solution: ["h3", "Kh5", "h4", "Kxh4", "Kxg8", "Kg5", "h7", "Kg6", "h8=Q"]
  },
  {
    order: 462,
    fen: "2k5/P2pP3/1p1P1pBK/1P6/5P1p/7p/8/4q2q w - - 0 0",
    solution: ["Be4", "Qhxe4", "e8=Q+", "Qxe8", "a8=Q#"]
  },
  {
    order: 463,
    fen: "6k1/pn4pp/2P5/8/2P5/1r6/P5PK/8 w - - 0 0",
    solution: ["c5", "Nxc5", "c7", "Ne6", "c8=Q+"]
  },
  {
    order: 464,
    fen: "8/2P5/8/8/3r4/8/2K5/k7 w - - 0 0",
    solution: ["c8=R", "Ra4", "Kb3", "Ra7", "Rc1#"]
  },
  {
    order: 465,
    fen: "5rk1/5ppp/4p3/3pP3/q2P4/1p2Q3/1P3P1P/1K4R1 w - - 0 0",
    solution: ["Rxg7+", "Kxg7", "Qg5+", "Kh8", "Qf6+", "Kg8", "Qg5+", "Kh8", "Qf6+"]
  },
  {
    order: 466,
    fen: "6k1/8/8/2n5/7P/1P3K2/2B5/8 b - - 0 0",
    solution: ["Nxb3", "Bxb3+", "Kh8"]
  },
  {
    order: 467,
    fen: "8/2k5/8/K7/7R/8/8/2q5 w - - 0 0",
    solution: ["Rc4+", "Qxc4"]
  },
  {
    order: 468,
    fen: "8/8/8/8/8/1k4q1/8/2KR4 w - - 0 0",
    solution: ["Rd3+", "Qxd3"]
  },
  {
    order: 469,
    fen: "8/8/8/8/8/5qk1/7R/6K1 w - - 0 0",
    solution: ["Rh3+", "Kxh3"]
  },
  {
    order: 470,
    fen: "8/8/8/8/p1k5/P1q5/K7/1R6 w - - 0 0",
    solution: ["Rc1", "Qxc1"]
  },
  {
    order: 471,
    fen: "1R6/8/8/5k2/5p2/7r/1p2K3/8 w - - 0 0",
    solution: ["Rxb2", "Rh2+", "Kf3", "Rxb2"]
  },
  {
    order: 472,
    fen: "K7/3n4/k4p2/5P1p/7P/8/4b3/1B6 w - - 0 0",
    solution: ["Bd3+", "Bxd3"]
  },
  {
    order: 473,
    fen: "8/8/pp6/kq5R/p4p1K/P1p2P1P/2P5/8 w - - 0 0",
    solution: ["Rf5", "Qxf5"]
  },
  {
    order: 474,
    fen: "k7/1p6/8/8/8/8/1q4rP/4Q2K w - - 0 0",
    solution: ["Qa5+", "Kb8", "Qd8+", "Ka7", "Qa5+", "Kb8", "Qd8+"]
  },
  {
    order: 475,
    fen: "5r1k/5npp/5p2/8/7N/7R/PP1q1r1P/1K6 w - - 0 0",
    solution: ["Ng6+", "Kg8", "Ne7+", "Kh8", "Ng6+"]
  },
  {
    order: 476,
    fen: "6Q1/8/8/3p4/8/5K2/7r/2q4k w - - 0 0",
    solution: ["Qg2+", "Rxg2"]
  },
  {
    order: 477,
    fen: "2k5/1R6/K7/7p/7P/8/2p5/8 w - - 0 0",
    solution: ["Rb5", "c1=Q", "Rc5+", "Qxc5"]
  },
  {
    order: 478,
    fen: "8/7p/p4Qpk/8/1q4PK/2p4P/8/8 w - - 0 0",
    solution: ["Qf4+", "Qxf4"]
  },
  {
    order: 479,
    fen: "7k/6p1/7p/8/1p6/pQqp4/P7/3K4 w - - 0 0",
    solution: ["Qg8+", "Kxg8"]
  },
  {
    order: 480,
    fen: "6b1/8/5k2/2p5/1pP5/pP6/P2q4/6QK w - - 0 0",
    solution: ["Qf2+", "Qxf2"]
  },
  {
    order: 481,
    fen: "8/8/5r2/6n1/5Q2/7k/5Kp1/8 w - - 0 0",
    solution: ["Kg1", "Rxf4"]
  },
  {
    order: 482,
    fen: "8/7P/4b1p1/2pp4/1p1k4/1P2p3/4K3/6q1 w - - 0 0",
    solution: ["h8=Q+", "Ke4", "Qh1+", "Qxh1"]
  },
  {
    order: 483,
    fen: "8/3p4/2p1pk2/4n3/5p2/5P1K/2r5/6Q1 w - - 0 0",
    solution: ["Qg5+", "Kxg5"]
  },
  {
    order: 484,
    fen: "8/8/8/8/3k4/6B1/p7/K2b2q1 w - - 0 0",
    solution: ["Bf2+", "Qxf2"]
  },
  {
    order: 485,
    fen: "6Q1/8/8/2n4p/7k/8/4K3/2q5 w - - 0 0",
    solution: ["Qg3+", "Kxg3"]
  },
  {
    order: 486,
    fen: "5bkr/1BR3p1/q6p/8/8/7r/PPP5/1K5R w - - 0 0",
    solution: ["Bd5+", "Kh7", "Be4+", "Kg8", "Bd5+"]
  },
  {
    order: 487,
    fen: "qk6/p7/P5p1/6p1/6Pp/7P/6BP/6K1 w - - 0 0",
    solution: ["Bf3", "Qxf3"]
  },
  {
    order: 488,
    fen: "8/8/7p/8/6P1/4b1k1/8/7K w - - 0 0",
    solution: ["g5", "Bxg5", "Kg1", "h5", "Kh1", "h4", "Kg1", "h3", "Kh1", "h2"]
  },
  {
    order: 489,
    fen: "8/r7/5kPK/7P/8/8/8/8 w - - 0 0",
    solution: ["g7", "Rxg7"]
  },
  {
    order: 490,
    fen: "5k2/8/8/3pp1p1/4b1Pp/3nP2P/4Q2K/r7 w - - 0 0",
    solution: ["Qf2+", "Ke7", "Qf7+", "Kd6", "Qd7+", "Kc5", "Qb5+", "Kd6", "Qc6+", "Ke7", "Qe6+", "Kd8", "Qd7+", "Kxd7"]
  },
  {
    order: 491,
    fen: "2q1r3/3p1Np1/B5p1/7k/8/4P1PP/7K/8 w - - 0 0",
    solution: ["Be2#"]
  },
  {
    order: 492,
    fen: "3r2rk/2Rn2pp/5p2/2p2P2/p4pRQ/3qP2P/6PK/8 w - - 0 0",
    solution: ["Qxh7+", "Kxh7", "Rh4#"]
  },
  {
    order: 493,
    fen: "r1b3k1/ppp2p2/3p1P2/2qPn1p1/4p3/2P3P1/PP2P1BP/R1Q4K w - - 0 0",
    solution: ["Qxg5+", "Kf8", "Qg7+", "Ke8", "Qg8+", "Kd7", "Bh3+", "Ng4", "Bxg4#"]
  },
  {
    order: 494,
    fen: "k3q3/p2r3p/P7/8/1Q6/Kp2r3/7P/2RB4 w - - 0 1",
    solution: ["Bf3+", "Rxf3", "Qe4+", "Qxe4", "Rc8#"]
  },
  {
    order: 495,
    fen: "r1bn1k1r/4bppp/pq6/1ppBNQ2/5B2/8/PP3PPP/R2R2K1 w - - 0 0",
    solution: ["Qxc8", "Rxc8", "Nd7+", "Kg8", "Nxb6", "Rc6", "Bxc6"]
  },
  {
    order: 496,
    fen: "8/4r1k1/p3npp1/4Q3/3P1P2/4P1P1/3q1N2/2R3K1 w - - 0 0",
    solution: ["Qxf6+", "Kxf6", "Ne4+", "Kf5", "Nxd2"]
  },
  {
    order: 497,
    fen: "8/8/2B2p2/1N3kp1/8/4K1BP/q7/8 w - - 0 0",
    solution: ["Be4+", "Ke6", "Bd5+", "Kxd5", "Nc3+", "Kc4", "Nxa2"]
  },
  {
    order: 498,
    fen: "6k1/6pp/4q3/5NP1/4B2P/6K1/8/8 w - - 0 0",
    solution: ["Bd5", "Qf7", "Bxf7+"]
  },
  {
    order: 499,
    fen: "5bk1/6np/6p1/3r1N2/8/7P/5P2/7K w - - 0 0",
    solution: ["Nh6+", "Kh8", "Nf7+", "Kg8", "Nh6+"]
  },
  {
    order: 500,
    fen: "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1",
    solution: ["Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"]
  },
  // ... tus 1000 puzzles
]

async function seedBlindPuzzles() {
  const db = getDb()
  const existing = await db.execute('SELECT COUNT(*) as c FROM blind_puzzles')
  if (existing.rows[0].c > 0) return
  for (const p of BLIND_PUZZLES) {
    await db.execute({
      sql: 'INSERT INTO blind_puzzles (order_number, fen, solution) VALUES (?, ?, ?)',
      args: [p.order, p.fen, JSON.stringify(p.solution)]
    })
  }
  console.log('✓ Blind puzzles seeded')
}

module.exports = { getDb, initDb }
