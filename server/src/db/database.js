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
  `)
}

async function seedIfEmpty() {
  const db = getDb()
  const { rows } = await db.execute('SELECT COUNT(*) as c FROM blocks')
  if (rows[0].c > 0) return

  for (const block of SEED_BLOCKS) {
    const r = await db.execute({
      sql: 'INSERT INTO blocks (name, description, category) VALUES (?, ?, ?)',
      args: [block.name, block.description, block.category ?? 'woodpecker'],
    })
    const blockId = r.lastInsertRowid
    for (let i = 0; i < block.puzzles.length; i++) {
      const p = block.puzzles[i]
      await db.execute({
        sql: 'INSERT INTO puzzles (block_id, order_in_block, fen, solution) VALUES (?, ?, ?, ?)',
        args: [blockId, i + 1, p.fen, JSON.stringify(p.solution)],
      })
    }
  }
  console.log('✓ Database seeded')
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
  await seedIfEmpty()
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

const SEED_BLOCKS_MATE = [
   { name: 'Mate Bloque 1', description: 'Mates 1–20', category: 'mate', puzzles: MATE_PUZZLES_BLOCK_1 },
   { name: 'Mate Bloque 2', description: 'Mates 21–40', category: 'mate', puzzles: MATE_PUZZLES_BLOCK_2 },
]

const SEED_BLOCKS = [
  { name: 'Bloque 1', description: 'Puzzles 1–20', category: 'woodpecker', puzzles: PUZZLES_BLOCK_1 },
  { name: 'Bloque 2', description: 'Puzzles 21–40', category: 'woodpecker', puzzles: PUZZLES_BLOCK_2 },
  { name: 'Bloque 3', description: 'Puzzles 41–60', category: 'woodpecker', puzzles: PUZZLES_BLOCK_3 },
  { name: 'Bloque 4', description: 'Puzzles 61–80', category: 'woodpecker', puzzles: PUZZLES_BLOCK_4 },
  ...SEED_BLOCKS_MATE,
]

module.exports = { getDb, initDb }
