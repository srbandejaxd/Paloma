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
      subcategory TEXT,
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
    let blockId
    const existing = await db.execute({
      sql: 'SELECT id FROM blocks WHERE name = ?',
      args: [block.name]
    })
    if (existing.rows.length === 0) {
      // Bloque nuevo — insertar
      const r = await db.execute({
        sql: 'INSERT INTO blocks (name, description, category, subcategory) VALUES (?, ?, ?, ?)',
        args: [block.name, block.description, block.category ?? 'woodpecker', block.subcategory ?? null]
      })
      blockId = r.lastInsertRowid
    } else {
      blockId = existing.rows[0].id
    }

    // Insertar puzzles que no existen aún por order_in_block
    for (let i = 0; i < block.puzzles.length; i++) {
      const p = block.puzzles[i]
      const orderInBlock = i + 1
      const existingPuzzle = await db.execute({
        sql: 'SELECT id FROM puzzles WHERE block_id = ? AND order_in_block = ?',
        args: [blockId, orderInBlock]
      })
      if (existingPuzzle.rows.length === 0) {
        await db.execute({
            sql: 'INSERT INTO puzzles (block_id, order_in_block, fen, solution) VALUES (?, ?, ?, ?)',
            args: [blockId, orderInBlock, p.fen, JSON.stringify(p.solution)]
        })
        console.log(`✓ New puzzle added: ${block.name} #${orderInBlock}`)
      } else {
        await db.execute({
            sql: 'UPDATE puzzles SET fen = ?, solution = ? WHERE block_id = ? AND order_in_block = ?',
            args: [p.fen, JSON.stringify(p.solution), blockId, orderInBlock]
        })
      }
    }
  }
}

async function migrateDb() {
  const db = getDb()
  try {
    await db.execute(`ALTER TABLE blocks ADD COLUMN category TEXT NOT NULL DEFAULT 'woodpecker'`)
    console.log('✓ Migration: added category column to blocks')
  } catch {
    // Column already exists, no-op
  }
  try {
    await db.execute(`ALTER TABLE blocks ADD COLUMN subcategory TEXT`)
    console.log('✓ Migration: added subcategory column to blocks')
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

// Agrega tus bloques aquí cuando estén listos, siguiendo el mismo formato:
// { name: 'Mate Bloque 1', description: 'Mates 1–20', category: 'mate', puzzles: MATE_PUZZLES_BLOCK_1 }
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
  },
  {
    fen: "8/8/4k1KP/8/5r2/8/8/8 w - - 0 1",
    solution: ["Kg7", "Rg4+", "Kf8", "Rf4+", "Kg7", "Rf7+", "Kg8", "Kf6", "h7", "Rg7+", "Kh8", "Ra7", "Kg8", "Ra8#"]
  },
  {
    fen: "8/8/5k1p/3r3p/7P/3pR3/3K4/8 w - - 0 1",
    solution: ["Rxd3", "Rxd3+", "Kxd3", "Kf5", "Ke3", "Kg4", "Kf2", "Kxh4", "Kg2", "Kg4", "Kh2", "h4", "Kg2", "h3+", "Kh2", "h5", "Kh1", "Kg3", "Kg1", "Kf3", "Kh2", "Kg4", "Kh1", "Kg3", "Kg1", "Kh4", "Kh2", "Kg4", "Kh1", "Kf3", "Kg1"]
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



const SEED_BLOCKS_WOODPECKER2 = [
  { name: 'W2 Bloque 1', description: 'Posicionales 1–21', category: 'woodpecker2', puzzles: WP2_PUZZLES_BLOCK_1 },
  { name: 'W2 Bloque 2', description: 'Posicionales 22–41', category: 'woodpecker2', puzzles: WP2_PUZZLES_BLOCK_2 },
  { name: 'W2 Bloque 3', description: 'Posicionales 42–62', category: 'woodpecker2', puzzles: WP2_PUZZLES_BLOCK_3 },
  { name: 'W2 Bloque 4', description: 'Posicionales 63–83', category: 'woodpecker2', puzzles: WP2_PUZZLES_BLOCK_4 },
]
const CHECKMATE_PATTERNS_1 = [
  { fen: "3q1r1k/1b1nNppp/4p3/1Nnp4/1R6/4PP2/2Q1B1PP/6K1 w - - 0 27", solution: ["Qxh7+","Kxh7","Rh4#"] },
  { fen: "4r2k/1p1b2pp/p7/5p2/q1B4R/8/1PP3PP/3Q2K1 w - - 0 28", solution: ["Rxh7+","Kxh7","Qh5#"] },
  { fen: "8/p3Rp2/6p1/3Nn1k1/7p/r5PK/8/8 b - - 0 40", solution: ["Rxg3+","Kh2","Nf3+","Kh1","Rg1#"] },
  { fen: "4R3/p4Ppk/1p5p/5P2/8/P1p5/5K2/3q4 w - - 0 50", solution: ["f8=N+","Kg8","Ng6+","Kf7","Rf8#"] },
  { fen: "3R4/p5p1/P5k1/8/4n1P1/3p4/4r2P/3K4 b - - 0 73", solution: ["Nc3+","Kc1","Rc2#"] },
  { fen: "r1q2r1k/1p2b1pp/7N/p2Q4/8/P5P1/1Bn1PPBP/5RK1 w - - 0 20", solution: ["Qg8+","Rxg8","Nf7#"] },
  { fen: "r2q1rk1/1p3ppp/p2b2b1/3p1N2/1P2n2Q/P2BP2P/1B3PP1/R3K2R w KQ - 0 19", solution: ["Qh6","gxh6","Nxh6#"] },
  { fen: "2rr3k/1R5p/8/p4pNP/1b1P4/2n1Pp2/PP1K1P2/6R1 w - - 0 29", solution: ["Nf7#"] },
  { fen: "r4nk1/2R4p/1p6/p2b1pP1/P2B4/1P6/7P/6K1 w - - 0 40", solution: ["Rg7+","Kh8","Rg6#"] },
  { fen: "r4rk1/1pp2ppp/1p1p4/n2P4/4P3/3n4/PB3PRP/R6K w - - 0 21", solution: ["Rxg7+","Kh8","Rg8+","Kxg8","Rg1#"] },
  { fen: "r4rk1/p2p1p1p/4nBpQ/q3P3/2p1b3/4R3/P4PPP/R5K1 w - - 0 24", solution: ["Qxh7+","Kxh7","Rh3+","Kg8","Rh8#"] },
  { fen: "rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9", solution: ["Qd8+","Kxd8","Bg5+","Kc7","Bd8#"] },
  { fen: "3r4/p4rPk/1b1q1P2/n1p1p3/1p6/5NR1/P4P1P/6RK w - - 0 32", solution: ["Rh3+","Kg8","Rh8#"] },
  { fen: "5kr1/1b6/1p2pPq1/p2pP2R/P2P4/7Q/5P1K/8 w - - 0 41", solution: ["Qa3+","Ke8","Qe7#"] },
  { fen: "q6r/1b2kpp1/p3p3/P1b5/1pN1P3/3BBPp1/1P4P1/R3QRK1 b - - 0 26", solution: ["Rh1+","Kxh1","Qh8+","Kg1","Qh2#"] },
  { fen: "r1b2rk1/ppp3p1/2npq3/2b3BQ/8/2NB1N2/PPP3PP/R4K1R w - - 0 15", solution: ["Bh7+","Kh8","Bg6+","Kg8","Qh7#"] },
  { fen: "6k1/pb4pp/1p2p2q/4P3/2Q2P2/P5P1/1B6/1B2R1K1 b - - 0 33", solution: ["Qh1+","Kf2","Qf3+","Kg1","Qg2#"] },
  { fen: "8/1b1p1pkp/1Q1P1p2/8/2p2P2/5q2/P4P1P/4RK2 b - - 0 32", solution: ["Qh3+","Ke2","Qd3#"] },
  { fen: "r6r/p1p3pk/3p3p/3Q4/2p5/2P3R1/P1q3PP/5RK1 w - - 0 26", solution: ["Rxg7+","Kxg7","Qf7#"] },
  { fen: "rnb1qbkr/ppp1p1p1/1n1pP2p/6N1/8/5Q2/PPPP1PPP/RNB1K2R w KQ - 0 9", solution: ["Qf7+","Qxf7","exf7#"] },
  { fen: "r3qk1r/ppp1n1pp/3pQb2/8/4P3/1BpP4/PPP3PP/R1B1K2R w KQ - 0 14", solution: ["Qxf6+","gxf6","Bh6#"] },
  { fen: "2r3k1/8/1pp2P1Q/4PB2/2pP4/8/PK6/6rq w - - 0 51", solution: ["Be6#"] },
  { fen: "6k1/1p3p1p/p5pb/2p5/P3P3/1Pnn1N2/5PPP/R4NK1 b - - 0 25", solution: ["Ne2+","Kh1","Nxf2#"] },
  { fen: "q2r1bk1/p3p2p/1p4p1/3b2Nn/1PB5/7P/PB3PP1/4Q1K1 w - - 0 28", solution: ["Qe6+","Bxe6","Bxe6#"] },
  { fen: "r4rk1/pb1qbp2/1p2p1p1/6Np/2P3n1/2B4Q/PPB2PPP/5RK1 w - - 0 22", solution: ["Qxh5","gxh5","Bh7#"] },
  { fen: "5rk1/1R1R1p1p/6p1/p1N1p3/5P2/1P4P1/r2nP1KP/8 w - - 0 44", solution: ["Ne6","fxe6","Rg7+","Kh8","Rxh7+","Kg8","Rbg7#"] },
  { fen: "r3q1kr/ppp5/3p2pQ/8/3PP1b1/5R2/PPP3P1/5RK1 w - - 0 20", solution: ["Rf8+","Qxf8","Rxf8+","Rxf8","Qxg6#"] },
  { fen: "4r1k1/pp2q2R/6P1/2pp4/5b1Q/2P2N2/PP3P2/1K6 b - - 0 37", solution: ["Qe4+","Ka1","Qe1+","Nxe1","Rxe1#"] },
  { fen: "r5rk/2p2Q1p/1p1p4/p4R1p/Pn1b4/3qP2P/6R1/2K3B1 w - - 0 35", solution: ["Qxh7+","Kxh7","Rxh5#"] },
  { fen: "8/5Q1p/5ppk/p5r1/5R2/5q2/PB3P1P/4K3 b - - 0 33", solution: ["Rg1+","Kd2","Rd1+","Kc2","Qd3#"] },
  { fen: "r1R1Q3/7r/1k1p1p2/p3p3/4P1p1/7P/P1P2PPK/1q6 w - - 0 34", solution: ["Qc6+","Ka7","Rxa8#"] },
  { fen: "rnbqkbn1/ppppp3/7r/6pp/3P1p2/3BP1B1/PPP2PPP/RN1QK1NR w KQq - 0 7", solution: ["Qxh5+","Rxh5","Bg6#"] },
  { fen: "r1bqkbnr/pppp1p1p/6p1/4p3/2BnP3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 5", solution: ["Qxf7#"] },
  { fen: "rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6", solution: ["Bxf7+","Ke7","Nd5#"] }
]

const CHECKMATE_PATTERNS_2 = [
  { fen: "1q3rk1/2pn1ppp/8/3N4/4Q3/8/1P6/1K2R3 w - - 0 1", solution: ["Ne7+","Kh8","Qxh7+","Kxh7","Rh1#"] },
  { fen: "3r3k/pp2Nrpp/3n4/1nq2p2/5B2/3R3Q/PPP3PP/1K2R3 w - - 0 26", solution: ["Qxh7+","Kxh7","Rh3#"] },
  { fen: "1r3rk1/p4ppp/b1N1p3/3p2P1/3PnP2/1Pq5/P2N2P1/R2QK2R w KQ - 0 19", solution: ["Ne7+","Kh8","Rxh7+","Kxh7","Qh5#"] },
  { fen: "N1b4k/6bp/1QP3r1/1P1Bp2q/P3Pp2/5P2/4n1PP/5R1K b - - 0 33", solution: ["Qxh2+","Kxh2","Rh6#"] },
  { fen: "1q3rbk/Q5pp/8/3P4/1r3n2/R3N3/2B2PPP/5RK1 b - - 0 31", solution: ["Ne2+","Kh1","Qxh2+","Kxh2","Rh4#"] },
  { fen: "5k2/1r1p2pQ/1q3n2/6N1/8/8/1P6/1K2R3 w - - 0 1", solution: ["Qh8+","Ng8","Qxg8+","Kxg8","Re8#"] },
  { fen: "6k1/5pb1/1p1N3p/p5p1/5q2/Q6P/PPr5/3RR2K w - - 0 34", solution: ["Re8+","Bf8","Rxf8+","Kxf8","Nf5+","Kg8","Qf8+","Kxf8","Rd8#"] },
  { fen: "rnq3kr/1b4p1/p4bp1/1p4N1/4p3/2N1B2Q/PPP4P/2KR1R2 w - - 0 22", solution: ["Rd8+","Bxd8","Qxh8+","Kxh8","Rf8#"] },
  { fen: "1k2r2r/1p6/1Pp5/2Np2p1/3P1nP1/7p/8/R4R1K w - - 0 36", solution: ["Ra8+","Kxa8","Nd7","Re2","Ra1+","Ra2","Rxa2#"] },
  { fen: "r3r1k1/1p3p2/p7/3P1Q2/P4Pnp/5B2/1P3NPq/R1B2K2 b - - 0 24", solution: ["Qg1+","Kxg1","Re1#"] }
]

const CHECKMATE_PATTERNS_3 = [
  { fen: "5r1k/q5pp/8/3BN3/8/8/1P6/1K2R3 w - - 0 1", solution: ["Ng6+","hxg6","Rh1#"] },
  { fen: "r2q1r1k/ppp1N1pp/2n1Q3/8/2B5/5P2/PPP3KP/R7 w - - 0 19", solution: ["Ng6+","hxg6","Qh3+","Qh4","Qxh4#"] },
  { fen: "2b3r1/2r1pp1k/pp1p2pp/3P4/PqPQN1PP/1P2RP2/6K1/7R w - - 0 36", solution: ["Ng5+","hxg5","hxg5#"] },
  { fen: "r2q1rk1/1pp3pp/p2p1p2/2nN4/4P3/1Q4R1/PPP2PPP/5RK1 w - - 0 19", solution: ["Ne7+","Kh8","Ng6+","hxg6","Rh3#"] },
  { fen: "6k1/P6p/6p1/2b5/1p6/8/2rq1nPP/RR3QK1 b - - 0 37", solution: ["Ne4+","Kh1","Ng3+","hxg3","Qh6#"] },
  { fen: "3q3k/2R3p1/N6p/4p3/4nr2/3p4/5bPP/2Q2R1K b - - 0 38", solution: ["Ng3+","hxg3","Rh4+","gxh4","Qxh4#"] },
  { fen: "q4r1k/1r2p1p1/7p/6NQ/8/P7/BP3P2/K7 w - - 0 1", solution: ["Qg6","hxg5","Qh5#"] },
  { fen: "5r1k/6p1/b3B2p/2npP1NQ/pr5P/3P2P1/2P2P2/4b1K1 w - - 0 33", solution: ["Qg6","hxg5","Qh5#"] },
  { fen: "r1b2rk1/pp4p1/2n1p2p/5pNQ/2B5/2q5/P4PPP/4RRK1 w - - 0 18", solution: ["Rxe6","Bxe6","Bxe6+","Kh8","Qg6","hxg5","Qh5#"] },
  { fen: "r1bqr1k1/2p2ppp/2p5/p1bP4/4PPn1/3B4/PPQB2PP/R2N1R1K b - - 0 15", solution: ["Qh4","h3","Qg3","hxg4","Qh4#"] },
  { fen: "5rk1/5p1p/6pQ/3n2B1/2q5/8/1P6/1K2R3 w - - 0 1", solution: ["Qxf8+","Kxf8","Bh6+","Kg8","Re8#"] },
  { fen: "r5k1/4Bp1p/4p1p1/4P3/1PR2P2/8/1q4PP/2R4K w - - 0 36", solution: ["Rc8+","Rxc8","Rxc8+","Kg7","Bf8+","Kg8","Bh6#"] },
  { fen: "r1b2rk1/p1pp1p1p/1p4pQ/6B1/2qn4/5N2/PPP2bPP/2KRR3 w - - 0 17", solution: ["Qxf8+","Kxf8","Bh6+","Kg8","Re8#"] },
  { fen: "r2q2rk/ppp2p1p/3b1pn1/5R1Q/3P4/2P4N/PP4PP/R1B3K1 w - - 0 16", solution: ["Qxh7+","Kxh7","Rh5+","Kg7","Bh6+","Kh8","Bf8#"] },
  { fen: "4r1k1/p2b1p1p/1n1Q2p1/8/8/N5P1/P2RqPBP/6K1 b - - 0 23", solution: ["Qe1+","Bf1","Qxf1+","Kxf1","Bh3+","Kg1","Re1#"] },
  { fen: "5r1k/q5pp/8/r2B4/8/8/1P2Q3/1K5R w - - 0 1", solution: ["Rxh7+","Kxh7","Qh5#"] },
  { fen: "r1b3k1/pp5p/2B1p1p1/5r2/7q/1N6/PP2NbPP/R2Q1R1K b - - 0 21", solution: ["Qxh2+","Kxh2","Rh5#"] },
  { fen: "7r/3b1pk1/2p2qp1/8/1P1bNP2/r2B4/3Q2PP/2R2R1K b - - 0 29", solution: ["Rxh2+","Kxh2","Qh4#"] },
  { fen: "4r1k1/1p2ppb1/p2p2P1/3P1b2/q5r1/1NP1B3/PP1Q4/K5RR b - - 0 24", solution: ["Qxa2+","Kxa2","Ra4#"] },
  { fen: "2kr3r/pp3pp1/2p1p1p1/2q5/8/1P4P1/P2N2PP/R3QR1K b - - 0 20", solution: ["Rxh2+","Kxh2","Rh8#"] }
]

const CHECKMATE_PATTERNS_4 = [
  { fen: "8/R5bk/4n1p1/6Qp/4N3/8/1P5q/1K6 w - - 0 1", solution: ["Nf6+","Kh8","Qh6+","Bxh6","Rh7#"] },
  { fen: "8/4r1pk/2p1p2p/p2pP2Q/P2P1nN1/1rP3RP/3q1PP1/6RK w - - 0 36", solution: ["Qxh6+","gxh6","Nf6+","Kh8","Rg8#"] },
  { fen: "1r6/5Rbk/p2Pb1pp/Pp1Np3/2q1P3/4Q1PP/1P4B1/6K1 w - - 0 31", solution: ["Nf6+","Kh8","Qxh6+","Bxh6","Rh7#"] },
  { fen: "r6k/3nq1rp/p3pNQ1/1p1pn3/1PpP1P2/2P2N1R/P6P/6RK w - - 0 33", solution: ["Rxh7+","Rxh7","Qg8+","Rxg8","Rxg8#"] },
  { fen: "r4kr1/1p1b2pR/p2Np3/4P1Q1/1q6/8/PPP2PP1/2K5 w - - 0 25", solution: ["Qf6+","gxf6","Rf7#"] },
  { fen: "2k5/Qr1bR3/3pN2p/2pP4/1P6/6P1/6pK/2q5 w - - 0 48", solution: ["Qa8+","Rb8","Qc6+","Bxc6","Rc7#"] },
  { fen: "r4nk1/pp2r1p1/2p1P2p/3p1P1N/8/8/PPPK4/6RR w - - 0 27", solution: ["Nf6+","Kh8","Rxh6+","gxh6","Rg8#"] },
  { fen: "1r4k1/p5pp/4q3/2Q2pP1/3N4/P1n1P3/1R1B1P1P/K7 b - - 0 28", solution: ["Qa2+","Rxa2","Rb1#"] },
  { fen: "6k1/3R2pp/8/6r1/3n1p2/1P3P1K/P1r3P1/4R3 b - - 0 32", solution: ["Rg3+","Kh2","Nxf3+","Kh1","Rh3+","gxh3","Rh2#"] },
  { fen: "1Q6/1R3pk1/4p2p/p3n3/P3P2P/6PK/r5B1/3q4 b - - 0 46", solution: ["Qg4+","Kh2","Nf3+","Kh1","Qh3+","Bxh3","Rh2#"] }
]

const CHECKMATE_PATTERNS_5 = [
  { fen: "7k/7p/q6N/6P1/3R4/8/8/1K6 w - - 0 1", solution: ["Rd8+","Kg7","Rg8#"] },
  { fen: "5r1b/2R1R3/P4r2/2p2Nkp/2b3pN/6P1/4PP2/6K1 w - - 0 40", solution: ["Rg7+","Bxg7","Rxg7+","Rg6","Rxg6#"] },
  { fen: "8/pr3p1k/7p/q2pP2p/4N3/5Q2/5PPK/8 w - - 0 46", solution: ["Nf6+","Kg6","Qxh5+","Kg7","Qg4+","Kf8","Qg8+","Ke7","Qe8#"] },
  { fen: "8/Qp4pk/2p3b1/5p1p/3B3P/1P4P1/P1P1rnBK/3r4 b - - 0 38", solution: ["Ng4+","Kh3","Rh1+","Bxh1","Rh2#"] },
  { fen: "8/6p1/5p1k/BP1B4/5P1p/r6P/2R3P1/6Kn b - - 0 56", solution: ["Ra1+","Kh2","Ng3","Ra2","Rh1#"] },
  { fen: "7k/7p/q4p1N/8/3R4/8/8/1KB5 w - - 0 1", solution: ["Rd8+","Kg7","Rg8#"] },
  { fen: "4k3/R3p2p/3pN1p1/1p1K4/1P3P2/6rP/8/8 w - - 0 45", solution: ["Ra8+","Kf7","Rf8#"] },
  { fen: "5Bk1/1p3pp1/2p2n1p/4rq2/P3p3/2Q2nP1/BPP1RPKP/5R2 b - - 0 24", solution: ["Qh3+","Kxh3","Rh5+","Kg2","Rxh2#"] },
  { fen: "1r4k1/2R5/3p4/3P2B1/p1p4p/2b2RnP/P5P1/6K1 b - - 0 39", solution: ["Rb1+","Kf2","Bd4+","Be3","Rf1#"] },
  { fen: "5rk1/1p4pp/1p4r1/3R4/1P3b2/P5nP/1Q4P1/6K1 b - - 0 32", solution: ["Be3+","Kh2","Bg1+","Kxg1","Rf1+","Kh2","Rh1#"] }
]

const CHECKMATE_PATTERNS_6 = [
  { fen: "4k3/2R5/5K2/1r1r1N2/8/8/8/8 w - - 0 1", solution: ["Ng7+","Kd8","Ne6+","Ke8","Re7#"] },
  { fen: "2r5/8/8/5K1k/4N1R1/7P/8/8 w - - 0 67", solution: ["Nf6+","Kh6","Rg6#"] },
  { fen: "k7/3N4/P5p1/1P2n2p/5p2/8/1KR5/4r3 w - - 0 60", solution: ["Rc8+","Ka7","Rc7+","Ka8","Nb6+","Kb8","Rb7#"] },
  { fen: "8/1b6/p7/1p2Pk1p/5n2/6K1/PPr5/2B2R2 b - - 0 39", solution: ["Rg2+","Kh4","Rg4#"] },
  { fen: "8/P4R2/8/8/6n1/5pk1/r7/1R4K1 b - - 0 52", solution: ["Rg2+","Kf1","Ne3+","Ke1","Re2#"] },
  { fen: "4k3/6R1/4N1pp/5p2/5K2/5p1r/8/8 w - - 0 1", solution: ["Ke5","f2","Kf6","f1=Q","Re7#"] },
  { fen: "7k/R7/5K2/8/5PN1/7P/pr6/8 w - - 0 46", solution: ["Kg6","a1=Q","Rh7+","Kg8","Nf6+","Kf8","Rf7#"] },
  { fen: "2k5/4R3/1p4p1/pN1P4/2p2KPp/2Pb3P/8/1r6 w - - 0 80", solution: ["Na7+","Kd8","Nc6+","Kc8","d6","Rf1+","Kg5","Bf5","Rc7#"] },
  { fen: "6k1/1R6/8/3NKN1p/1P2p3/2P2r2/5r2/8 w - - 0 41", solution: ["Nf6+","Kf8","Ke6","Rxf5","Rf7#"] },
  { fen: "3r1k2/1R6/5N2/p2PP1K1/8/7P/5p2/3b4 w - - 0 50", solution: ["e6","Rxd5+","Kh6","Rh5+","Kg6","f1=Q","Rf7#"] }
]

const CHECKMATE_PATTERNS_7 = [
  { fen: "q1r4k/6pp/8/3Q2N1/8/8/8/1K6 w - - 0 1", solution: ["Nf7+","Kg8","Nh6+","Kh8","Qg8+","Rxg8","Nf7#"] },
  { fen: "r1b1k2r/ppppbN1p/2n2n2/7Q/3PP3/2N5/PPP4P/R1B1KB1q w Qkq - 0 12", solution: ["Nd6+","Kd8","Qe8+","Rxe8","Nf7#"] },
  { fen: "r1q1r2k/pp4bp/2p3p1/3Qp1N1/8/5N2/PPP2PPP/R3R1K1 w - - 0 18", solution: ["Nf7+","Kg8","Nh6+","Kh8","Qg8+","Rxg8","Nf7#"] },
  { fen: "r1k4r/ppp1bq1p/2n1N3/6B1/3p2Q1/8/PPP2PPP/R5K1 w - - 0 20", solution: ["Nc5+","Kb8","Nd7+","Kc8","Nb6+","Kb8","Qc8+","Rxc8","Nd7#"] },
  { fen: "rn1k1b2/pppb2p1/8/3Q1P2/6n1/5Nq1/PPPPB3/RNBK4 b - - 0 15", solution: ["Nf2+","Ke1","Nd3+","Kd1","Qe1+","Nxe1","Nf2#"] },
  { fen: "r6k/1p4q1/2p1Q3/p2p4/4n3/P7/1PP3PP/5RK1 b - - 0 27", solution: ["Qd4+","Kh1","Nf2+","Kg1","Nh3+","Kh1","Qg1+","Rxg1","Nf2#"] },
  { fen: "r2qr1kb/1p1bpp1p/p2p2pB/6N1/2Q1PPn1/2N5/PPP3PP/R3R1K1 b - - 0 16", solution: ["Qb6+","Kh1","Nf2+","Kg1","Nh3+","Kh1","Qg1+","Rxg1","Nf2#"] },
  { fen: "1qr3k1/5ppp/8/3QN3/8/1B6/8/1K6 w - - 0 1", solution: ["Qxf7+","Kh8","Qg8+","Rxg8","Nf7#"] },
  { fen: "rnbk3N/ppppbQ1p/5nB1/8/3Pp3/8/PPqNKP1P/R7 w - - 0 15", solution: ["Qe8+","Nxe8","Nf7#"] },
  { fen: "r1br2k1/1p3ppp/1q1N4/p2Q4/2B2n2/2P5/PP4PP/R2K1R2 w - - 0 19", solution: ["Qxf7+","Kh8","Qg8+","Rxg8","Nf7#"] }
]

const CHECKMATE_PATTERNS_8 = [
  { fen: "q1r4k/6p1/8/3Q2N1/8/8/2B5/1K6 w - - 0 1", solution: ["Nf7+","Kg8","Nh6+","Kh8","Qg8+","Rxg8","Nf7#"] },
  { fen: "3r4/p5bk/1p4Np/2q3p1/8/PQ1B2P1/KP6/8 w - - 0 41", solution: ["Ne7+","Kh8","Qg8+","Rxg8","Ng6+","Kh7","Ne5+","Kh8","Nf7#"] },
  { fen: "4B1k1/p1p2pp1/Q2b4/8/4n3/P3qN1P/1P4P1/R6K b - - 0 25", solution: ["Nf2+","Kg1","Nxh3+","Kh1","Qg1+","Nxg1","Nf2#"] },
  { fen: "3r1k2/pb1r3Q/3Np1p1/1q6/Np6/1P4P1/P3nP1P/3RRK2 b - - 0 29", solution: ["Nxg3+","Kg1","Qf1+","Rxf1","Ne2#"] },
  { fen: "q4rk1/p4ppp/6n1/5N2/8/7Q/1BP3P1/1K6 w - - 0 1", solution: ["Qh6","gxh6","Nxh6#"] },
  { fen: "r4rk1/5ppp/p3q1n1/2p2NQ1/4n3/P3P3/1B3PPP/1R3RK1 w - - 0 23", solution: ["Qh6","gxh6","Nxh6#"] },
  { fen: "r4rk1/ppp2pp1/7p/3P4/2P1Nnq1/5bB1/PPP2PPP/RN2QRK1 b - - 0 17", solution: ["Qh3","gxh3","Nxh3#"] },
  { fen: "r4rk1/3q1pp1/pp5p/1p6/5n2/1BP1RbN1/PPQ2PPP/5RK1 b - - 0 22", solution: ["Qh3","gxh3","Nxh3#"] },
  { fen: "3q1rk1/5p1p/6p1/1Q3n2/6N1/2B5/1PPP4/1K6 w - - 0 1", solution: ["Qxf5","gxf5","Nh6#"] },
  { fen: "r3kr2/ppQb2pp/2p2n2/6B1/2N5/2P5/PPP2qPP/3R3K w - - 0 19", solution: ["Qxd7+","Nxd7","Nd6#"] },
  { fen: "3rkn1R/pp2bp2/8/q2N1B2/3P4/PQ6/1P3P2/1K6 w - - 0 31", solution: ["Qb5+","Qxb5","Nc7#"] },
  { fen: "r3r1k1/1p3pp1/p1q3N1/P1p3n1/6b1/2N1P1B1/1PQ2PPP/R4RK1 b - - 0 21", solution: ["Qxg2+","Kxg2","Bf3+","Kg1","Nh3#"] },
  { fen: "3qk2r/4pp1p/6p1/8/4N3/8/3B4/1K2R3 w k - 0 1", solution: ["Nf6+","Kf8","Bh6#"] },
  { fen: "r2qk2r/1pp1np1p/3p1p2/1pbNp1B1/4P3/2PP4/PP3PPP/R4RK1 w kq - 0 12", solution: ["Nxf6+","Kf8","Bh6#"] },
  { fen: "2b1kb1r/1r1n1ppp/p1N4q/1p2p3/4N3/6Q1/PPP1B1PP/1K1R3R w k - 0 18", solution: ["Qxe5+","Qe6","Nf6+","gxf6","Qxe6+","fxe6","Bh5#"] },
  { fen: "r3k1r1/pp3p1p/4p3/4n3/b2BP3/7P/P4PP1/R1Q3KR b q - 0 20", solution: ["Nf3+","Kf1","Bb5+","Qc4","Bxc4#"] }
]

const CHECKMATE_PATTERNS_9 = [
  { fen: "1q1n3k/7p/8/4N3/8/1r2b3/1P1Q4/1K4R1 w - - 0 1", solution: ["Qxd8+","Qxd8","Nf7#"] },
  { fen: "1r4k1/5p1p/p3p1p1/b1RPP3/2bn1NP1/p6P/B4P2/K1B5 b - - 0 33", solution: ["Nc2#"] },
  { fen: "6k1/ppp5/8/3pR3/3P1rP1/7n/PP1N3P/7K b - - 0 30", solution: ["Rxg4","Nf3","Nf2#"] },
  { fen: "5rk1/p2RQ3/1q2p3/1p3p2/4n3/2P2Br1/PP5P/5R1K b - - 0 27", solution: ["Qg1+","Rxg1","Nf2#"] },
  { fen: "2k5/p2r3p/2p5/N1P5/P1P2R1n/3n4/4r1PP/1RB3K1 b - - 0 31", solution: ["Re1+","Rf1","Nf3+","gxf3","Rg7+","Kh1","Nf2#"] }
]

const CHECKMATE_PATTERNS_10 = [
  { fen: "5rk1/5ppp/8/8/8/2B5/8/1K4R1 w - - 0 1", solution: ["Rxg7+","Kh8","Rxf7+","Kg8","Rg7+","Kh8","Rg5+","Rf6","Bxf6#"] },
  { fen: "2r1nrk1/pp1q1p1p/3bpp2/5P2/1P1Q4/P3P3/1BP2P1P/R3K2R w KQ - 0 17", solution: ["Rg1+","Kh8","Qxf6+","Nxf6","Bxf6#"] },
  { fen: "2r2rk1/5ppp/pp6/2q5/2P2P2/3pP1RP/P5P1/B1R3K1 w - - 0 29", solution: ["Rxg7+","Kh8","Rxf7+","Kg8","Rg7+","Kh8","Rg6+","Qe5","Bxe5+","Rf6","Bxf6#"] },
  { fen: "r4rk1/ppp2ppp/4p3/1PPP3P/8/1P1q4/1B3P2/R3K1R1 w - - 0 27", solution: ["Rxg7+","Kh8","Rxf7+","Kg8","Rg7+","Kh8","Rg6+","Qd4","Bxd4+","e5","Bxe5+","Rf6","Bxf6#"] },
  { fen: "2q2rk1/pb4pp/8/1pPR1pb1/2Q1p3/1P2P1P1/PB3P1P/5BK1 w - - 0 23", solution: ["Rd7+","bxc4","Rxg7+","Kh8","Rxg5+","c3","Bxc3+","Rf6","Bxf6#"] },
  { fen: "6k1/6pp/p1p5/1p1p4/1P1Pb3/P5PB/1r3r1P/R4RK1 b - - 0 38", solution: ["Rg2+","Bxg2","Rxg2+","Kh1","Rxg3+","Rf3","Bxf3#"] },
  { fen: "5rk1/7p/p3p3/3b2pQ/3P4/8/r5PP/2R2RK1 b - - 0 43", solution: ["Rxg2+","Kh1","Rg4+","Rf3","Bxf3#"] },
  { fen: "r7/pp6/k7/3q1b2/5N2/2P1B1Q1/PP4rP/R6K b - - 0 32", solution: ["Rxg3+","Nxd5","Be4#"] }
]

const CHECKMATE_PATTERNS_11 = [
  { fen: "1q3rk1/2p2ppp/8/1n6/8/2B5/8/1KR3R1 w - - 0 1", solution: ["Rxg7+","Kh8","Rg8+","Kxg8","Rg1#"] },
  { fen: "2rqnrk1/pp3ppp/1b1p4/3p2Q1/2n1P3/3B1P2/PB2NP1P/R5RK w - - 0 19", solution: ["Qxg7+","Nxg7","Rxg7+","Kh8","Rg8+","Kxg8","Rg1+","Qg5","Rxg5#"] },
  { fen: "1k5r/pp3p1p/2q1p3/2Q1P3/1P1p4/8/P1P2PrP/RN3R1K b - - 0 20", solution: ["Rg1+","Kxg1","Rg8#"] },
  { fen: "2kr2r1/ppp2p1p/2nQ4/3bp3/2B5/3P4/PPP2PPP/R1B2RK1 b - - 0 13", solution: ["Rxg2+","Kh1","Rg1+","Kxg1","Rg8+","Qg6","Rxg6+","Bg5","Rxg5#"] },
  { fen: "1q3rk1/2p2p1p/5p1B/1n6/8/8/8/1KR5 w - - 0 1", solution: ["Rg1+","Kh8","Bg7+","Kg8","Bxf6#"] },
  { fen: "5rk1/prpn1p1p/1p3p1B/8/3P4/4Pq2/PP3P1P/R3K2R w KQ - 0 18", solution: ["Rg1+","Kh8","Bg7+","Kg8","Bxf6+","Qg4","Rxg4#"] },
  { fen: "5rk1/prp2p1p/4n2B/7p/1qBPP2P/1P3P2/P2Q1P2/1K5R w - - 0 27", solution: ["Rg1+","Kh8","Bxe6","Qxd2","Bg7+","Kg8","Bf6+","Qg5","Rxg5#"] },
  { fen: "r7/1p6/p1kP4/4P3/P5q1/2P2Q1b/1P3PPP/R4RK1 b - - 0 32", solution: ["Qxf3","gxf3","Rg8+","Kh1","Bg2+","Kg1","Bxf3#"] }
]

const CHECKMATE_PATTERNS_12 = [
  { fen: "2q2rk1/5p1p/6p1/8/1R5Q/2B5/8/1K6 w - - 0 1", solution: ["Qxh7+","Kxh7","Rh4+","Kg8","Rh8#"] },
  { fen: "r4rk1/ppq2pnp/4pBp1/3bR3/3P4/2PB3P/1P1Q1PP1/4R1K1 w - - 0 23", solution: ["Qh6","Ne8","Qxh7+","Kxh7","Rh5+","Kg8","Rh8#"] },
  { fen: "r3k2r/pbp2pp1/3b1n2/1p6/3P3p/1B2N1Pq/PP1PQP1P/R1B1NRK1 b kq - 0 16", solution: ["Qxh2+","Kxh2","hxg3+","Kg1","Rh1#"] },
  { fen: "4kb1r/3n1ppp/4q3/6B1/8/1Q6/8/1K1R4 w k - 0 1", solution: ["Qb8+","Nxb8","Rd8#"] },
  { fen: "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16", solution: ["Qb8+","Nxb8","Rd8#"] },
  { fen: "r1b1k2r/ppp2ppp/2n1p1qn/6B1/1b2Q3/2N2N2/PPP2PPP/2KR1B1R w kq - 0 10", solution: ["Qxc6+","bxc6","Rd8#"] },
  { fen: "1rb2k1r/p1p1bppp/2B5/6q1/8/8/PPP2PPP/RN1QR1K1 w - - 0 14", solution: ["Qd8+","Bxd8","Re8#"] },
  { fen: "b7/p7/1p2R3/3R2rk/2P5/1P2b3/P6P/7K b - - 0 35", solution: ["Bxd5+","cxd5","Rg1#"] },
  { fen: "1r1r2k1/1q3p2/6p1/8/3Q4/2R5/1B6/1K6 w - - 0 1", solution: ["Qh8+","Kxh8","Rh3+","Kg8","Rh8#"] },
  { fen: "6k1/pp6/5Rp1/1q3b2/8/1PB2p2/P5P1/K6R w - - 0 32", solution: ["Rh8+","Kxh8","Rf8+","Kh7","Rh8#"] },
  { fen: "7k/1p2b2p/1qp2r2/p3pPQ1/8/P2P3P/1P4B1/6RK w - - 0 43", solution: ["Qg8+","Kxg8","Bd5+","Kf8","Rg8#"] },
  { fen: "2kr1b1r/pppb1ppp/3q4/1B2P3/4Q3/P7/1PP2PPP/R1B1K2R b KQ - 0 11", solution: ["Qd1+","Kxd1","Bg4+","Ke1","Rd1#"] },
  { fen: "rnb2b1r/ppk2ppp/2p5/4q1B1/4n3/8/PPP2PPP/2KR1BNR w - - 0 1", solution: ["Bd8#"] },
  { fen: "rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9", solution: ["Qd8+","Kxd8","Bg5+","Kc7","Bd8#"] },
  { fen: "3r2k1/p4rP1/1b1q1P2/n1p1p3/1p6/5N1R/P4P1P/6RK w - - 0 1", solution: ["Rh8#"] },
  { fen: "3r2k1/p4rPp/1b1q3Q/n1p1pP2/1p6/3B1NR1/P4P1P/6RK w - - 0 29", solution: ["Qxh7+","Kxh7","f6+","Kg8","Bh7+","Kxh7","Rh3+","Kg8","Rh8#"] }
]

const CHECKMATE_PATTERNS_13 = [
  { fen: "6k1/6p1/4P1Qp/1q6/8/1r6/1P6/1K3R2 w - - 0 1", solution: ["Rf8+","Kxf8","Qf7#"] },
  { fen: "r4k2/2q2p1p/4pQRP/1b6/PP6/2r5/5PP1/6K1 w - - 0 31", solution: ["Rg8+","Kxg8","Qg7#"] },
  { fen: "5k2/2n3p1/1q2p1Qr/2ppPP2/1pP5/rN2n3/P5PP/R4RK1 w - - 0 26", solution: ["fxe6+","Kg8","Rf8+","Kxf8","Qf7#"] },
  { fen: "2r1n1k1/5Rpp/1q2P3/1p2QB2/2p5/7P/6PK/8 w - - 0 38", solution: ["Bxh7+","Kxh7","Qh5+","Kg8","Rf8+","Kxf8","Qf7#"] },
  { fen: "4rk2/QR3p2/p4P1p/P3p1p1/4q3/7P/6PK/8 w - - 0 36", solution: ["Rxf7+","Kg8","Rf8+","Rxf8","Qg7#"] },
  { fen: "6k1/5p2/5Pn1/1q6/6R1/1r6/1P6/1K4Q1 w - - 0 1", solution: ["Rxg6+","fxg6","Qxg6+","Kf8","Qg7+","Ke8","Qe7#"] },
  { fen: "r1bq3k/pp3Qb1/2n3Pp/5p2/3p4/5p2/PPPB2P1/R3KB1R w KQ - 0 19", solution: ["Rxh6+","Bxh6","Qh7#"] },
  { fen: "r4rk1/1p1b1ppp/2n1pP2/qp1p4/5P2/2PB4/P1P3PP/1RBQ1R1K w - - 0 15", solution: ["Bxh7+","Kxh7","Qh5+","Kg8","Qg5","g6","Qh6","Qxc3","Qg7#"] },
  { fen: "2Q5/6k1/p5p1/Pb1P2q1/1P2rpP1/7p/7P/R2R3K b - - 0 42", solution: ["Re1+","Rxe1","Qxd5+","Kg1","Qg2#"] },
  { fen: "6k1/p2B2p1/2Q5/3r2np/8/4p1qP/PP4P1/5RK1 b - - 0 34", solution: ["Nf3+","Rxf3","Rd1+","Rf1","Rxf1+","Kxf1","Qf2#"] }
]

const CHECKMATE_PATTERNS_14 = [
  { fen: "5rk1/6p1/5pP1/8/1r6/1q6/1P2Q3/1K5R w - - 0 1", solution: ["Rh8+","Kxh8","Qh5+","Kg8","Qh7#"] },
  { fen: "5rk1/2pq1pp1/3b2p1/4p1BP/1r2P3/1B3QP1/1P3nK1/R6R w - - 0 30", solution: ["hxg6","Rxb3","Rh8+","Kxh8","Qh5+","Kg8","Qh7#"] },
  { fen: "r4rk1/1p3ppR/p2bq1P1/8/4P1P1/4pN2/nP2KP2/1Q1R4 w - - 0 23", solution: ["Rh8+","Kxh8","Rh1+","Kg8","Rh8+","Kxh8","Qh1+","Kg8","Qh7#"] },
  { fen: "6k1/p1p2p1p/2p5/4b3/3q3r/1Q2R1p1/1P4PP/5R1K b - - 0 30", solution: ["Rxh2+","Kg1","Rh1+","Kxh1","Qh4+","Kg1","Qh2#"] },
  { fen: "1q1r1r2/1bb2pk1/pN1pp3/4n1p1/1PPQP3/1N2BPp1/P5P1/2RR1B1K b - - 0 27", solution: ["Rh8+","Kg1","Rh1+","Kxh1","Rh8+","Kg1","Rh1+","Kxh1","Qh8+","Kg1","Qh2#"] },
  { fen: "6k1/4q3/1r4PQ/8/8/1r6/1P6/1K3R2 w - - 0 1", solution: ["Rf8+","Qxf8","Qh7#"] },
  { fen: "5knQ/1p3p2/p2p1Pr1/3q2B1/3pr3/7P/PP4PK/2R2R2 w - - 0 28", solution: ["Rc8+","Re8","Bh6+","Rxh6","Qg7#"] },
  { fen: "1rb2r1k/1p3p1p/p1N1pPp1/2npP3/P6Q/2q2B2/2P3PP/3R1R1K w - - 0 25", solution: ["Qh6","Rg8","Nd8","Rxd8","Qg7#"] },
  { fen: "r1bq2k1/pp1n2p1/2n1p1P1/3pPr1Q/1b6/1NP5/PP3PP1/R1B1K3 w Q - 0 18", solution: ["Qh7+","Kf8","Qh8+","Ke7","Bg5+","Rxg5","Qxg7+","Ke8","Qf7#"] },
  { fen: "5rk1/7q/3P4/p1p5/PpP3p1/1P1R2pP/4Q3/7K b - - 0 45", solution: ["Qxh3+","Kg1","Rf1+","Qxf1","Qh2#"] }
]

const CHECKMATE_PATTERNS_15 = [
  { fen: "7k/6p1/7q/8/2B5/8/8/1K2Q3 w - - 0 1", solution: ["Qe8+","Kh7","Bg8+","Kh8","Bf7+","Kh7","Qg8#"] },
  { fen: "5rk1/2qb2p1/p1p1pr2/1pP4Q/3PB3/1P2P1P1/P4P2/3R1RK1 w - - 0 25", solution: ["Bh7+","Kh8","Bg6+","Kg8","Qh7#"] },
  { fen: "2Q5/6pk/5b1p/8/2BpP3/P5P1/5PKP/2qq4 w - - 0 34", solution: ["Qg8+","Kg6","Qe8+","Kh7","Bg8+","Kh8","Bf7+","Kh7","Qg8#"] },
  { fen: "r3nb1k/4q1p1/p4p2/1b3B2/1p1Q4/5NNP/PP2p1P1/2r1R1K1 w - - 0 32", solution: ["Qh4+","Kg8","Qh7+","Kf7","Qh5+","Kg8","Bh7+","Kh8","Bg6+","Kg8","Qh7#"] },
  { fen: "1rr1n2k/3Rq1pB/1B2p1Qp/1p2b3/8/8/1PP1N1P1/5R1K b - - 0 30", solution: ["Qh4+","Kg1","Bh2+","Kh1","Bg3+","Kg1","Qh2#"] },
  { fen: "5rk1/p5p1/2p2r1p/2pp4/4PbP1/P4P2/1PPNQKPq/R4R2 b - - 0 28", solution: ["Qh4+","Kg1","Bh2+","Kh1","Bg3+","Kg1","Qh2#"] },
  { fen: "r1bq2k1/p5pp/2pb4/3p4/N3p1P1/1P6/PBP1RrP1/R2Q1BK1 b - - 0 18", solution: ["Qh4","Qd4","Bh2+","Kh1","Bg3+","Kg1","Qh2#"] },
  { fen: "r3k3/ppp2pp1/8/2bpPq1P/8/1B1p4/PPPP2P1/RNBQ3K b q - 0 16", solution: ["Qe4","Qf3","Qh4+","Qh3","Qe1+","Kh2","Bg1+","Kh1","Bf2+","Kh2","Qg1#"] }
]

const CHECKMATE_PATTERNS_16 = [
  { fen: "1q3r1k/5pp1/7p/8/8/4Q3/1B6/1K6 w - - 0 1", solution: ["Qxh6+","Kg8","Qxg7#"] },
  { fen: "5r1k/R1N3pp/1P1Qb3/4ppq1/4P2b/8/5PP1/2rBK2R b K - 0 28", solution: ["Qe3+","Kf1","Qxf2#"] },
  { fen: "r3r1k1/1p3ppp/3pq3/pP6/P3b3/2R3PP/3Q1PB1/2R4K b - - 0 26", solution: ["Qxh3+","Kg1","Qxg2#"] },
  { fen: "3r1rk1/pb1qbppp/8/8/PppPnP2/8/1PR1B1PP/RN1Q2BK b - - 0 21", solution: ["Ng3+","hxg3","Qh3+","Bh2","Qxg2#"] },
  { fen: "6k1/1r2r1b1/6Q1/1q6/4B2R/8/K7/8 w - - 0 1", solution: ["Rh8+","Kxh8","Qh7#"] },
  { fen: "2rrk3/QR3pp1/2n1b2p/1BB1q3/3P4/8/P4PPP/6K1 w - - 0 31", solution: ["Re7+","Kf8","Re8+","Kxe8","Qe7#"] },
  { fen: "1k6/1b3p1p/p7/3qp3/Np5Q/4BP2/PPP3rP/R4K2 b - - 0 26", solution: ["Qxf3+","Bf2","Rg1+","Kxg1","Qh1#"] },
  { fen: "4r2k/ppR3p1/5qBp/3p4/8/7b/PPQ2PP1/6K1 b - - 0 25", solution: ["Re1+","Kh2","Qf4+","g3","Rh1+","Kxh1","Qf3+","Kg1","Qg2#"] },
  { fen: "1q3rk1/5pp1/8/1r6/8/4Q3/1B6/1K5R w - - 0 1", solution: ["Rh8+","Kxh8","Qh6+","Kg8","Qxg7#"] },
  { fen: "4q1k1/5pp1/1p4n1/p1r3QR/7P/8/P3rPP1/B4RK1 w - - 0 27", solution: ["Rh8+","Kxh8","Qh6+","Kg8","Qxg7#"] },
  { fen: "8/1pB4p/1Pb2pkP/6p1/2N1r3/1q6/1R3PPK/2R5 b - - 0 51", solution: ["Rh4+","Kg1","Rh1+","Kxh1","Qh3+","Kg1","Qxg2#"] },
  { fen: "5n1k/1R6/2p2p1p/3b3P/P2P1q2/3B2R1/1Q3PPK/4r3 b - - 0 47", solution: ["Qh4+","Rh3","Rh1+","Kxh1","Qxh3+","Kg1","Qxg2#"] },
  { fen: "6k1/8/7b/1q1Pp3/2n1P3/7B/8/K4Q2 w - - 0 1", solution: ["Be6+","Kh8","Qf6+","Kh7","Qf7+","Bg7","Bf5+","Kh8","Qh5+","Kg8","Be6+","Kf8","Qf7#"] },
  { fen: "2r3k1/1b1R2bp/p7/4ppB1/1p2q3/1P5Q/P1P4P/1K3R2 w - - 0 27", solution: ["Rxg7+","Kxg7","Qh6+","Kg8","Qe6+","Kg7","Bh6+","Kh8","Qf6+","Kg8","Qg7#"] },
  { fen: "4Qbk1/6p1/7p/1p1p4/4bP2/1P2B1R1/2PK4/5q2 w - - 0 43", solution: ["Rxg7+","Kxg7","Bd4+","Kg8","Qe6+","Kh7","Qf7+","Bg7","Qxg7#"] },
  { fen: "2B4k/1P6/3p4/3Pb2p/5p1P/3p1P2/3Q2K1/1q6 b - - 0 48", solution: ["Bd4","Qxf4","Qg1+","Kh3","Qf1+","Kg3","Bf2+","Kh2","Qg1+","Kh3","Qh1+","Qh2","Qxf3+","Qg3","Qxg3#"] },
  { fen: "1Q6/5k1p/5np1/1r3q2/1B6/8/2P5/1K6 w - - 0 1", solution: ["Qf8+","Ke6","Qd6+","Kf7","Qe7+","Kg8","Qf8#"] },
  { fen: "3qrk2/p4ppQ/2b2b1p/2r5/1p1p1N2/1B2PP2/PP4PP/3R1RK1 w - - 0 24", solution: ["Ng6+","fxg6","Qg8+","Ke7","Qe6+","Kf8","Qf7#"] },
  { fen: "6kr/6b1/p1N1pq2/2P4p/2p1Q2P/2N3P1/P4R2/K2R4 b - - 0 34", solution: ["Qxc3+","Kb1","Qa1+","Kc2","Qb2#"] },
  { fen: "8/pkp5/1pb1pN2/4Pp2/7Q/P6P/1P1q1P1K/3r2R1 b - - 0 35", solution: ["Rxg1","Kxg1","Qe1+","Kh2","Qh1+","Kg3","Qf3+","Kh2","Qg2#"] },
  { fen: "1q4k1/5p2/1r5Q/8/8/8/1PB5/1K6 w - - 0 1", solution: ["Bh7+","Kh8","Bg6+","Kg8","Qh7+","Kf8","Qxf7#"] },
  { fen: "1n3Q2/p6k/1p2B1p1/2p1q2p/2P1p3/P5PP/1P3PK1/8 w - - 0 38", solution: ["Bg8+","Kh8","Bf7+","Kh7","Qg8+","Kh6","Qxg6#"] },
  { fen: "r1b1nrk1/pp1n1pp1/2p1pq2/7R/3P4/2NBP3/PP1K1PP1/R2Q4 w - - 0 15", solution: ["Bh7+","Kh8","Bg6+","Kg8","Rh8+","Kxh8","Qh5+","Kg8","Qh7#"] },
  { fen: "R7/2p2kpp/3b2r1/1p2R1B1/1P2Q3/2P4q/5P1P/6K1 b - - 0 33", solution: ["Rxg5+","Rxg5","Bxh2+","Kh1","Bg3+","Kg1","Qh2+","Kf1","Qxf2#"] }
]

const CHECKMATE_PATTERNS_17 = [
  { fen: "5k2/1q3p2/6p1/1r4Q1/8/8/1P6/1K5R w - - 0 1", solution: ["Qd8+","Kg7","Qh8#"] },
  { fen: "6k1/4qr2/3pnrPQ/3Pp3/p3P3/8/1P6/6RK w - - 0 53", solution: ["gxf7+","Kxf7","Qh5+","Kf8","Qh8+","Kf7","Qg8#"] },
  { fen: "8/2qk2Np/p2p1Q2/3Pp3/b3P1pP/2p1N3/6PK/r7 w - - 0 53", solution: ["Qe6+","Kd8","Qg8+","Ke7","Nef5+","Kd7","Qe8#"] },
  { fen: "3Q4/1B3pkp/p2p2nb/1p6/3Np1r1/2P2q2/PP3P1P/4RK1R b - - 0 29", solution: ["Qh3+","Ke2","Qd3#"] },
  { fen: "R7/1N4r1/2q3r1/3p4/3kp3/6Q1/1P6/1K6 w - - 0 1", solution: ["Ra4+","Qxa4","Qc3#"] },
  { fen: "6k1/1p1b3p/2pp2p1/p7/2Pb2Pq/1P1PpK2/P1N3RP/1RQ5 b - - 0 32", solution: ["Bxg4+","Rxg4","Qf2+","Ke4","Qf5+","Kxd4","Qe5#"] },
  { fen: "2r5/4k1pp/p2p4/BpnPp3/4q3/5Q2/PP1K1bPP/3R1R2 b - - 0 28", solution: ["Nb3+","Qxb3","Rc2+","Qxc2","Qe3#"] },
  { fen: "6k1/1q1Q1pp1/7p/8/1rB1P3/8/1P6/1K6 w - - 0 1", solution: ["Bxf7+","Kh7","Bg6+","Kxg6","Qf5#"] },
  { fen: "7k/3b2r1/8/2PQ1p2/pp3P2/P3RKP1/1q3R2/3B3r b - - 0 50", solution: ["Rxg3+","Kxg3","Qg7+","Kf3","Qg4#"] },
  { fen: "1r3rk1/5p1p/pp2b1p1/4n3/4PP2/1BP1B1Pq/P6P/R1QR2K1 b - - 0 27", solution: ["Nf3+","Kf2","Qxh2+","Kxf3","Bg4+","Kxg4","Qh5#"] },
  { fen: "1q6/1r6/8/5n2/4k1N1/6Q1/1P6/1K6 w - - 0 1", solution: ["Nf6+","Kd4","Qc3#"] },
  { fen: "2Q5/8/p5P1/2pk4/2Np1b2/1P6/P6q/3K4 w - - 0 51", solution: ["Qb7+","Ke6","Qf7#"] },
  { fen: "r1b2b1r/5ppp/3N4/2q1k3/8/1Q6/PPP2PPP/2KR4 w - - 0 20", solution: ["f4+","Kxf4","Qg3#"] },
  { fen: "1q6/1r6/8/5p2/B3k3/6Q1/1P6/1K6 w - - 0 1", solution: ["Bc6+","Kd4","Qc3#"] },
  { fen: "5n2/3n2kp/1p4p1/8/2Q2N1P/1B4PK/3p4/q7 w - - 0 57", solution: ["Nh5+","gxh5","Qg8+","Kf6","Qg5#"] },
  { fen: "5r1k/2rq3p/pp4p1/2nBb3/3pP1Q1/B2P4/PP4P1/5R1K w - - 0 37", solution: ["Rxf8+","Kg7","Rg8+","Kf6","Qh4+","g5","Qxg5#"] },
  { fen: "2bk3N/1p1p3p/3bn1p1/4r3/6P1/5Q1K/PPq4P/R1B2R2 b - - 0 28", solution: ["Rh5+","gxh5","Qxh2+","Kg4","Qxh5#"] }
]

const CHECKMATE_PATTERNS_18 = [
  { fen: "5k2/1q3p2/8/1r3pQ1/3b4/8/1P6/1K5R w - - 0 1", solution: ["Qd8+","Kg7","Qh8+","Kg6","Qh6#"] },
  { fen: "8/8/p2P4/6Rp/2rQpk1P/q7/P5b1/4K3 w - - 0 57", solution: ["Qf6+","Ke3","Qf2+","Kd3","Qd2#"] },
  { fen: "8/5p1k/6pp/1P6/8/1Q1B1PP1/1R4K1/2r1q3 b - - 0 52", solution: ["Qh1+","Kf2","Qg1+","Ke2","Qe1#"] },
  { fen: "r4r1k/2p1R2p/p7/1p3p2/3P1np1/1BP5/PP3Q1q/1N2RK2 b - - 0 25", solution: ["Qh1+","Qg1","Qh3+","Kf2","Qf3#"] },
  { fen: "4r1k1/5ppp/p2p1b1P/3P1bP1/1Q3P2/1P3K2/1P1R2R1/6Bq b - - 0 28", solution: ["Qh3+","Rg3","Qf1+","Bf2","Qh1+","Rg2","Qh5+","Kg3","Qh3#"] },
  { fen: "8/1Q6/3rkr2/1R6/8/5P2/3q4/1K6 w - - 0 1", solution: ["Re5+","Kxe5","Qe4#"] },
  { fen: "7k/p3QRrp/b3p3/3pq1P1/1p5P/8/P5B1/7K w - - 0 43", solution: ["Qf8+","Rg8","Rxh7+","Kxh7","Qh6#"] },
  { fen: "8/2p3k1/1pPp2q1/p7/2P5/1P2Q1pp/P4Rr1/4RN1K b - - 0 48", solution: ["Rg1+","Kxg1","gxf2+","Kxf2","Qg2#"] },
  { fen: "2B1b1R1/5k1p/6r1/3Nn3/6Q1/8/1Pq5/K7 w - - 0 1", solution: ["Be6+","Rxe6","Qg7#"] },
  { fen: "1Q6/p3q1k1/1p2p1p1/r2b4/3P2R1/8/6P1/5R1K w - - 0 34", solution: ["Qe5+","Kh7","Rf7+","Qxf7","Rh4+","Kg8","Qh8#"] },
  { fen: "8/Q7/3b3k/2n1q3/6rp/8/5PP1/1B4K1 w - - 0 58", solution: ["Qh7+","Kg5","Qg6+","Kf4","Qf7+","Kg5","f4+","Rxf4","Qg6#"] },
  { fen: "b4k2/5Np1/p3p3/2p3P1/2P2Q2/5n1P/PqB5/5K2 b - - 0 41", solution: ["Qa1+","Ke2","Qe1+","Kd3","Be4+","Qxe4","Qd2#"] }
]

const CHECKMATE_PATTERNS_19 = [
  { fen: "1q3rk1/1r3p1p/4nPpQ/8/6N1/8/1B6/1K6 w - - 0 1", solution: ["Qg7+","Nxg7","Nh6+","Kh8","fxg7#"] },
  { fen: "rnbq2kr/ppp3pp/4P2n/3p2NQ/4p3/B1P5/P1P2PPP/R3KB1R w KQ - 0 11", solution: ["Qf7+","Nxf7","exf7#"] },
  { fen: "r7/6R1/ppkqrn1B/2pp3p/P6n/2N5/8/1Q1R1K2 w - - 0 33", solution: ["Qb5+","axb5","axb5#"] },
  { fen: "2r2rk1/1p3pb1/3P2b1/1P2n2P/p7/P1NpPq2/QB1K1P2/1N3R1R b - - 0 30", solution: ["Qe2+","Nxe2","Rc2+","Ke1","Nf3+","Kd1","dxe2#"] },
  { fen: "1q4n1/1r3p1k/8/6PP/6N1/8/QB6/1K6 w - - 0 1", solution: ["Qxf7+","Rxf7","g6#"] },
  { fen: "8/r6p/2p2Qp1/4Np1k/4p2P/4q3/p4RPK/8 w - - 0 48", solution: ["Rxf5+","gxf5","Qxf5+","Kh6","Qf6+","Kh5","g4#"] },
  { fen: "r1b3nr/ppqk1Bbp/2pp4/4P1B1/3n4/3P4/PPP2QPP/R4RK1 w - - 0 16", solution: ["Qf5+","Nxf5","e6#"] },
  { fen: "4rr2/p5p1/B1p1Q3/2q3k1/5p2/P7/6PP/4RK1R w - - 0 28", solution: ["h4+","Kh5","Be2+","f3","g4#"] },
  { fen: "2rb2R1/8/8/2q4k/1R6/6P1/8/1KB5 w - - 0 1", solution: ["Rh4+","Bxh4","g4#"] },
  { fen: "5r1r/1p6/p1p2p2/2P1bPpk/4R3/6PP/P2B2K1/3R4 w - - 0 47", solution: ["Rh4+","gxh4","g4#"] },
  { fen: "r1b2r2/pp3pnP/1qp2B1k/5R2/6P1/3B4/PPP4P/R6K w - - 0 29", solution: ["Rh5+","Nxh5","g5#"] },
  { fen: "1R6/8/p1k3p1/3p1r2/3P2K1/2P4P/1P2r3/3B4 b - - 0 44", solution: ["Rg2+","Kh4","Rh5+","Bxh5","g5#"] },
  { fen: "q4rkb/1R3p2/7P/8/8/8/2Q5/1K6 w - - 0 1", solution: ["Qg6+","fxg6","h7#"] },
  { fen: "r4rk1/pp4pp/2p3n1/3p2N1/2P2PK1/3B2P1/PP5q/R1BQ1RN1 b - - 0 21", solution: ["Ne5+","fxe5","h5#"] },
  { fen: "8/5pk1/2p3p1/p1np2P1/1r3Pb1/PPKB4/2P4r/2N1RR2 b - - 0 28", solution: ["Na4+","bxa4","d4#"] },
  { fen: "Q7/3bk3/5p2/4p3/2P1P1p1/p2p1qP1/1P3P1r/3BKR2 b - - 0 42", solution: ["Qe3+","fxe3","d2#"] },
  { fen: "5b2/1q3p1k/7P/8/1r6/8/1B4Q1/1K5R w - - 0 1", solution: ["Qg8+","Kxg8","h7#"] },
  { fen: "r1b3nr/pppk2qp/1bnp4/4p1BQ/2BPP3/2P5/PP3PPP/RN3RK1 w - - 0 12", solution: ["Be6+","Kxe6","Qe8+","Nge7","d5#"] },
  { fen: "r3qrn1/b2b2k1/p2p1nP1/1p2p2Q/2p5/2P3RP/PPBB1PNK/6R1 w - - 0 29", solution: ["Qh8+","Kxh8","g7#"] },
  { fen: "1r3r2/p1R4p/1p3npk/3q1p2/6P1/1P2PQ2/P4P1P/6K1 w - - 0 26", solution: ["g5+","Kxg5","h4+","Kxh4","Qg3+","Kh5","Qh3+","Kg5","f4#"] },
  { fen: "6R1/q2p4/1r1P1N1k/2p5/8/PN3pP1/1P3P2/1K6 w - - 0 1", solution: ["g4","Rxb3","g5#"] },
  { fen: "8/8/7p/5p1k/5K2/6Pp/pB6/8 w - - 0 49", solution: ["Kxf5","h2","Bf6","h1=Q","g4#"] },
  { fen: "4r3/4np2/B3p1k1/p2pK2p/5P1P/6P1/P1P5/4R3 b - - 0 43", solution: ["Nf5","Bd3","f6#"] },
  { fen: "6k1/5p2/1p6/2bbP1pp/8/1P1r2PK/PR1R3P/8 b - - 0 37", solution: ["Be7","Rxd3","g4#"] }
]

const CHECKMATE_PATTERNS_20 = [
  { fen: "2kr4/1p1n1q2/2p5/8/5B2/8/4B3/2Q3K1 w - - 0 1", solution: ["Qxc6+","bxc6","Ba6#"] },
  { fen: "2kr1b1r/pp3ppp/2p1b2q/4B3/4Q3/2PB2R1/PPP2PPP/3R2K1 w - - 0 20", solution: ["Qxc6+","bxc6","Ba6#"] },
  { fen: "2kr2nr/pp1n1ppp/2p1p3/8/1P1P1B2/2N2Q1P/1PPKBPP1/7q w - - 0 13", solution: ["Qxc6+","bxc6","Ba6#"] },
  { fen: "2k1rb1r/ppp3pp/2n2q2/3B1b2/5P2/2P1BQ2/PP1N1P1P/2KR3R b - - 0 14", solution: ["Qxc3+","bxc3","Ba3#"] },
  { fen: "r2r2k1/ppp2ppp/4p3/2n1Pb2/1bPq1P2/2N1BQ2/PP4PP/2KR1B1R b - - 0 14", solution: ["Qxc3+","bxc3","Ba3#"] },
  { fen: "3qk2r/3n1pp1/4pn1p/8/8/B2B4/8/1K2Q3 w k - 0 1", solution: ["Qxe6+","fxe6","Bg6#"] },
  { fen: "r1bqk2r/p1pn1pp1/1p2pn1p/8/3P4/B1PB4/P1P1QPPP/R3K1NR w KQkq - 0 10", solution: ["Qxe6+","fxe6","Bg6#"] },
  { fen: "3qr1k1/pbr1bp1p/1pn1p1pB/8/2BP1QN1/2P3P1/P4P1P/2R1R1K1 w - - 0 22", solution: ["Qxf7+","Kxf7","Bxe6#"] },
  { fen: "4kb1r/5np1/p3p1Qp/qp1bP1B1/8/6P1/P4PBP/3R2K1 w k - 0 27", solution: ["Qxe6+","Bxe6","Bc6+","Bd7","Bxd7#"] },
  { fen: "4r1k1/3b1ppp/p7/1pb2q2/8/1P1Q1N1P/P7/3R1K1R b - - 0 28", solution: ["Qxh3+","Rxh3","Bxh3#"] }
]

const CHECKMATE_PATTERNS_21 = [
  { fen: "5k2/3Q1pp1/1b6/5B2/8/8/1r3qPK/8 w - - 0 1", solution: ["Qd6+","Ke8","Bd7+","Kd8","Bb5+","Kc8","Ba6#"] },
  { fen: "1Q6/3B4/3p1p1k/1p1Pp1n1/2p3P1/2P5/1P4PK/4q3 w - - 0 55", solution: ["Qf8+","Kh7","Bf5#"] },
  { fen: "8/8/pq3krQ/2n1p1p1/3pP1P1/2p2PB1/PPP5/1K6 w - - 0 35", solution: ["Qf8+","Ke6","Qe8+","Kd6","Bxe5#"] },
  { fen: "8/3kP3/3b1Qp1/1q4B1/6P1/2p5/5P2/6K1 w - - 0 50", solution: ["e8=Q+","Kxe8","Qe6+","Kf8","Bh6#"] },
  { fen: "3r4/p4k2/1p1n3Q/n1p1p2N/P3q3/2P5/7P/R1B3K1 w - - 0 39", solution: ["Qf6+","Ke8","Qe6+","Kf8","Bh6#"] },
  { fen: "4k3/5n1P/5Q2/3pp3/4q3/4B1K1/8/8 w - - 0 75", solution: ["Qe6+","Kf8","h8=Q+","Nxh8","Bh6#"] },
  { fen: "8/2k5/3b4/1p1P3p/p1q5/P1P3pP/1P2rN2/RK4QR b - - 0 37", solution: ["Rxb2+","Kxb2","Qb3+","Kc1","Bf4#"] },
  { fen: "8/5pbk/4p3/4P1pK/3P4/1Q2BP1P/5Pq1/8 b - - 0 44", solution: ["Qxh3+","Kxg5","f6+","exf6","Bh6#"] }
]

const CHECKMATE_PATTERNS_22 = [
  { fen: "1q4k1/1r4nr/8/4N3/6N1/B7/1P6/1K6 w - - 0 1", solution: ["Nf6+","Kh8","Ng6#"] },
  { fen: "2br4/pR4bk/2p4p/P7/3PNN2/4n3/4B1PP/6K1 w - - 0 30", solution: ["Nf6+","Kh8","Ng6#"] },
  { fen: "r4rk1/pp4pp/2p1bp2/4NN2/3P3R/8/PPPb2PP/5RK1 w - - 0 20", solution: ["Ne7+","Kh8","N5g6#"] },
  { fen: "4k3/6pp/n1N1pp2/P6r/1pN1P2P/1P3PP1/1K1R4/6b1 w - - 0 40", solution: ["Rd8+","Kf7","Nd6+","Kg6","Ne7+","Kh6","Nf7#"] },
  { fen: "8/6kp/1Np3p1/2P3nn/3p4/1P5P/P4qBK/5Q2 b - - 0 37", solution: ["Nf3+","Kh1","Ng3#"] },
  { fen: "1q2n1k1/1r3n2/6N1/7N/8/2Q5/1P6/1K6 w - - 0 1", solution: ["Qg7+","Nxg7","Nf6#"] },
  { fen: "r3q3/pbpn1rbk/1p4np/3Pp3/2P1N2N/4B3/PPB3QP/R6K w - - 0 27", solution: ["Qxg6+","Kh8","Qh7+","Kxh7","Nf6+","Kh8","Ng6#"] },
  { fen: "rnbk1b1r/ppqpnQ1p/4p1p1/2p1N1B1/4N3/8/PPP2PPP/R3KB1R w KQ - 0 11", solution: ["Qe8+","Kxe8","Nf6+","Kd8","Nf7#"] },
  { fen: "r3k2Q/ppp2p1p/3p4/8/2P1n3/1P1B1n1P/P2P1qP1/R1B2R1K b q - 0 16", solution: ["Kd7","Qg7","Qg1+","Rxg1","Nf2#"] },
  { fen: "5rk1/ppQ2pp1/7p/6q1/2n5/5B2/PPPn2PP/2KR3R b - - 0 26", solution: ["Nb3+","Kb1","Qc1+","Rxc1","Ncd2#"] }
]

const CHECKMATE_PATTERNS_23 = [
  { fen: "1r5k/7p/3q4/3B4/7Q/4b3/1P3B2/1K6 w - - 0 1", solution: ["Qd4+","Bxd4","Bxd4+","Qf6","Bxf6#"] },
  { fen: "r3r2k/pp1n3p/5P1B/2Q5/3pb3/3q2P1/PP4BP/R4R1K w - - 0 24", solution: ["Bg7+","Kg8","Qd5+","Bxd5","Bxd5+","Re6","Bxe6#"] },
  { fen: "r3k2r/pbpp1ppp/1p6/2bBPP2/8/1QPp1P1q/PP1P3P/RNBR3K b kq - 0 15", solution: ["Qxf3+","Bxf3","Bxf3#"] },
  { fen: "7k/6bp/8/1q1B4/8/8/1P3B2/1KR5 w - - 0 1", solution: ["Rc8+","Bf8","Bd4#"] },
  { fen: "r1bq3k/pp2R2p/3B1bp1/2pB1p2/2Pp4/3P2Q1/P1P3PP/6K1 w - - 0 23", solution: ["Qe5","Qxe7","Qxe7","Bxe7","Be5+","Bf6","Bxf6#"] },
  { fen: "r3kb1r/4pppp/p1q5/BN6/5n2/2P5/bP2QPPP/3RKB1R w Kkq - 0 18", solution: ["Nc7+","Qxc7","Qb5+","axb5","Bxb5+","Qd7","Bxd7#"] },
  { fen: "1r5k/7p/3q4/2pB4/1p6/4Q3/1P3B2/1K6 w - - 0 1", solution: ["Qd4+","cxd4","Bxd4+","Qf6","Bxf6#"] },
  { fen: "2b5/8/p1pn4/4r1p1/R7/8/1P1B1K1k/5B2 w - - 0 48", solution: ["Rh4+","gxh4","Bf4+","Kh1","Bg2#"] },
  { fen: "4rbk1/1p5b/2p4p/p6p/8/1P3QP1/PBq2PBP/1R4K1 w - - 0 27", solution: ["Qd5+","cxd5","Bxd5+","Re6","Bxe6#"] },
  { fen: "1q6/1rr5/1Rp1k1p1/3p1pP1/4pP2/BQ2P3/8/1K1B4 w - - 0 1", solution: ["Qxd5+","Kxd5","Bb3#"] },
  { fen: "3r2r1/p2q4/bpkPn1pp/3p4/2pP4/P1P2QB1/1PB2PP1/4RK2 w - - 0 40", solution: ["Qxd5+","Kxd5","Be4#"] },
  { fen: "1r6/2bb4/3pP3/2pPn1kp/2P2pp1/2B2P2/qNBQK3/6R1 w - - 0 55", solution: ["Qxf4+","Kxf4","Bd2#"] }
]

const CHECKMATE_PATTERNS_24 = [
  { fen: "r4rk1/pb1qbp2/1p2p1p1/6Np/3B4/3B4/PPP4Q/1K6 w - - 0 1", solution: ["Qxh5","gxh5","Bh7#"] },
  { fen: "2q1rrk1/1b1pb2p/p3p1p1/1p2B1Nn/4BP2/PP6/2P1Q1PP/R4R1K w - - 0 22", solution: ["Qxh5","gxh5","Bxh7#"] },
  { fen: "3b1rk1/p1q2p1p/bp2p3/5nNp/2P3N1/8/PB3PPP/1BR3K1 w - - 0 24", solution: ["Nh6+","Nxh6","Bxh7#"] },
  { fen: "r2r2k1/pb3ppp/1p1bpn2/7q/3n4/PP1B2P1/1B1N1P1P/RQ2NRK1 b - - 0 16", solution: ["Ng4","h4","Qxh4","gxh4","Bh2#"] },
  { fen: "r4rk1/pb1qbp2/1p2p1p1/3p1N1p/3B4/3B4/PPP4Q/1K6 w - - 0 1", solution: ["Qxh5","gxh5","Nh6#"] },
  { fen: "1r3r1k/6p1/p6p/2bpNBP1/1p2n3/1P5Q/PBP1q2P/1K5R w - - 0 31", solution: ["Qxh6+","gxh6","Nf7+","Kg8","Nxh6#"] },
  { fen: "rnbq1r1k/ppppnBp1/1b5p/6NQ/3PPB2/8/PPP3PP/RN3K1R w - - 0 11", solution: ["Qxh6+","gxh6","Be5#"] }
]

const CHECKMATE_PATTERNS_25 = [
  { fen: "2q2rk1/R3R1pp/8/8/8/8/8/1K6 w - - 0 1", solution: ["Rxg7+","Kh8","Rxh7+","Kg8","Rag7#"] },
  { fen: "r4r1k/2R2Rp1/b3pN1p/3p1p1P/p2P1K2/Pp2PPP1/1P6/8 w - - 0 37", solution: ["Rxg7","Rxf6","Ke5","Rff8","Rh7+","Kg8","Rcg7#"] },
  { fen: "r4rk1/2R5/1n2N1pp/2Rp4/p2P4/P3P2P/qP3PPK/8 w - - 0 31", solution: ["Rg7+","Kh8","Rcc7","Qxb2","Rh7+","Kg8","Rcg7#"] },
  { fen: "4rk1r/3R1ppp/p2q4/2p5/8/8/PP4PP/5R1K w - - 0 31", solution: ["Rfxf7+","Kg8","Rxg7+","Kf8","Rdf7#"] },
  { fen: "8/pp2R2p/4Nkb1/3P1p2/1B5p/8/PP1rr2P/5R1K b - - 0 32", solution: ["Rxh2+","Kg1","Rdg2#"] }
]

const CHECKMATE_PATTERNS_26 = [
  { fen: "r3q1kr/8/6pQ/8/8/8/5R2/1K3R2 w - - 0 1", solution: ["Rf8+","Qxf8","Rxf8+","Rxf8","Qxg6#"] },
  { fen: "r7/1k1n1ppp/rb2p3/1N6/2RP4/B5P1/4PP1P/1R4K1 w - - 0 25", solution: ["Nd6+","Kb8","Rc8+","Ka7","Rc7+","Bxc7","Rb7#"] },
  { fen: "r3r3/pp2k2N/4p3/3p4/3P1QP1/2P2N2/PP3q2/2K1R3 w - - 0 29", solution: ["Qc7#"] },
  { fen: "r1b2r2/1p3pkp/p7/2bp1pB1/2q5/2N2K2/P1PQ2PP/1R2R3 w - - 0 20", solution: ["Bf6+","Kxf6","Qh6#"] },
  { fen: "5r2/pp2QPk1/6r1/q1p5/3P4/6R1/PPP2PP1/1K6 w - - 0 27", solution: ["Qe5+","Kxf7","Qf5+","Rf6","Qd7#"] },
  { fen: "8/6pk/8/2P1Qp1p/4b1r1/7q/PP1NKR2/3R4 b - - 0 45", solution: ["Qd3+","Ke1","Rg1+","Nf1","Rxf1+","Rxf1","Qe3#"] },
  { fen: "8/1pN2r1k/1Pp1R2p/2P1Qn2/5P2/4p3/7P/3q2RK b - - 0 44", solution: ["Qf3+","Rg2","Qf1+","Rg1","Ng3+","hxg3","Qh3#"] },
  { fen: "7r/2Q2pk1/5bp1/8/P1BpqRK1/6P1/1P5P/8 b - - 0 33", solution: ["Rh4+","gxh4","Qg2#"] }
]

const CHECKMATE_PATTERNS_27 = [
  { fen: "1r4k1/1q3ppp/8/8/8/8/1P1R4/1K1R4 w - - 0 1", solution: ["Rd8+","Rxd8","Rxd8#"] },
  { fen: "r5k1/3R1ppp/1b2p3/pQP1q1P1/1n6/1P5P/1P4N1/1K1R4 w - - 0 31", solution: ["Rd8+","Rxd8","Rxd8+","Bxd8","Qe8#"] },
  { fen: "5k1r/4npp1/p3p2p/3nP2P/3P3Q/3N4/qB2KPP1/2R5 w - - 0 28", solution: ["Rc8+","Nxc8","Qd8#"] },
  { fen: "5k2/pq1b1p1p/1p6/8/1P1Q4/P5R1/2PK3P/4r3 w - - 0 38", solution: ["Qd6+","Re7","Qh6+","Ke8","Rg8#"] },
  { fen: "6k1/5pbr/3R4/3Q4/1P2P2p/2q4P/6P1/6K1 w - - 0 62", solution: ["Rd8+","Bf8","Qg5+","Rg7","Rxf8+","Kxf8","Qd8#"] },
  { fen: "5rk1/5ppp/7q/8/8/1BR2Q2/8/1K6 w - - 0 1", solution: ["Qxf7+","Rxf7","Rc8#"] },
  { fen: "3rr1k1/pbp2ppp/8/1NP1N3/2P1qR2/P3p3/4Q1PP/R1B4K b - - 0 20", solution: ["Rd1+","Rf1","Qxg2+","Qxg2","Rxf1#"] },
  { fen: "r4rk1/5qpp/1p1Q4/1Pp1p3/2P5/3PR3/5PPP/5RK1 b - - 0 29", solution: ["Qxf2+","Rxf2","Ra1+","Re1","Rxe1+","Rf1","Rexf1#"] },
  { fen: "4r1k1/pb3p2/2qp2pB/1p6/3n2Q1/6N1/PP3RPP/1B5K b - - 0 30", solution: ["Qxg2+","Rxg2","Re1+","Nf1","Rxf1#"] },
  { fen: "r6k/5ppp/8/3BN3/q7/8/1P6/1K3R2 w - - 0 1", solution: ["Nxf7+","Kg8","Nd8+","Kh8","Rf8#"] },
  { fen: "rr3k2/2R3pp/3NBp2/1b1P2P1/1p3P1P/8/1b4K1/8 w - - 0 35", solution: ["Rf7+","Kg8","Rxf6+","Kh8","Nf7+","Kg8","Nd8+","Kh8","Rf8#"] },
  { fen: "5rk1/1Q2p1bp/5qp1/2B5/2p3n1/2N5/PP4PP/R5K1 b - - 0 26", solution: ["Qd4+","Bxd4","Bxd4+","Kh1","Nf2+","Kg1","Nd1+","Kh1","Rf1#"] },
  { fen: "q5k1/5ppp/8/p1B5/Pp3n2/2b4P/2Q2PP1/3R2K1 w - - 0 1", solution: ["Qe4"] },
  { fen: "2rr2k1/p2N1ppp/8/q2n4/8/6P1/PQ3P1P/3RR1K1 w - - 0 26", solution: ["Qe5"] },
  { fen: "5r1k/pQ4pp/8/5p2/4rB1q/8/PP4P1/R4RK1 w - - 0 26", solution: ["Qxe4","fxe4","Bg5"] },
  { fen: "3r1nk1/pq3p1p/4pBp1/2p5/2P3Q1/1P6/P4PPP/3R2K1 b - - 0 24", solution: ["Qe4"] },
  { fen: "4rbk1/5p1p/p3q1p1/1p6/1P3Q2/P1R5/6PP/2R4K b - - 0 33", solution: ["Bh6"] },
  { fen: "r3r1k1/pp4pp/2pNb1n1/8/3q4/P1NR4/1PQ2RPP/6K1 b - - 0 22", solution: ["Bc4"] }
]

const CHECKMATE_PATTERNS_28 = [
  { fen: "8/8/8/8/1k6/pp4R1/q6Q/2K5 w - - 0 1", solution: ["Qh4+","Kc5","Rg5+","Kd6","Qh6+","Ke7","Rg7+","Kf8","Qh8#"] },
  { fen: "3r1k2/8/R6R/5Np1/5n2/2P2PK1/1r4PP/8 w - - 0 37", solution: ["Rh8+","Kf7","Rh7+","Ke8","Re7+","Kf8","Rf6+","Kg8","Rg7+","Kh8","Rh6#"] },
  { fen: "6k1/8/p1r1R1Pp/1p1R4/8/P5K1/2r5/8 w - - 0 39", solution: ["Rd8+","Kg7","Rd7+","Kf8","Rf7+","Kg8","Re8#"] },
  { fen: "5k2/7p/4p1p1/R3p1P1/4Pn1r/8/2BR1P2/5K2 w - - 0 50", solution: ["Ra8+","Ke7","Ra7+","Ke8","Ba4+","Kf8","Rd8#"] },
  { fen: "r1q4r/6k1/4p1p1/pp1nPpP1/3P3Q/P1P4R/3B3R/6K1 w - - 0 43", solution: ["Qh7+","Rxh7","Rxh7+","Kf8","Rh8+","Ke7","R2h7#"] },
  { fen: "1r3r1k/1q3p1p/3p4/7Q/8/8/1P4R1/1K4R1 w - - 0 1", solution: ["Qxh7+","Kxh7","Rh2#"] },
  { fen: "5r1k/1pp1b2p/p2p4/PP1P1P2/2P5/2q2p2/6RQ/6RK w - - 0 39", solution: ["Qxh7+","Kxh7","Rh2+","Bh4","Rxh4#"] },
  { fen: "r1br2k1/4qp1p/4p2Q/p3bp1R/2BR4/8/P3NPPP/6K1 w - - 0 25", solution: ["Rg5+","Kh8","Qxh7+","Kxh7","Rh4#"] },
  { fen: "5rk1/1ppq2p1/p2p1r2/4p3/1P2PP2/2P1QP2/1P1N1RK1/5R2 b - - 0 24", solution: ["Rg6+","Kh1","Qh3+","Rh2","Qxh2+","Kxh2","Kf7","fxe5","Rh8+","Qh6","Rhxh6#"] },
  { fen: "5rk1/6bp/p2pb3/1p4r1/1N2Bq2/2P2P2/PP5P/R2Q1R1K b - - 0 25", solution: ["Qxh2+","Kxh2","Rf6","Bxh7+","Kh8","Bg6","Rfxg6","f4","Rh6+","Qh5","Rhxh5#"] },
  { fen: "1r5k/8/8/1r2n3/3p3q/5Q2/1P4R1/1K4R1 w - - 0 1", solution: ["Qf6+","Qxf6","Rh2+","Qh4","Rxh4#"] },
  { fen: "r4rk1/1q2bp1p/5Rp1/pp1Pp3/4B2Q/P2R4/1PP3PP/7K w - - 0 29", solution: ["Rh3","h5","Qxh5","gxh5","Rg3+","Kh8","Rh6#"] },
  { fen: "1rr2b2/p2R1P2/4pk1p/4p1pQ/1pq1P3/2N4R/PPP4P/2K5 w - - 0 30", solution: ["Qxh6+","Bxh6","Rxh6+","Kg7","f8=Q+","Kxf8","Rh8#"] },
  { fen: "2RQ4/3npk1p/q4np1/2p5/1p6/4B3/rP3PPP/3KR3 w - - 0 28", solution: ["Qxe7+","Kxe7","Bxc5+","Kf7","Re7#"] },
  { fen: "4r2k/pp6/3Q1p2/8/3P3q/P4PRp/1P5P/4r1RK w - - 0 50", solution: ["Qxf6+","Qxf6","Rxh3+","Qh6","Rxh6#"] },
  { fen: "6k1/4Q2p/1r6/3n4/7r/1P6/2B4q/1KR5 w - - 0 1", solution: ["Bxh7+","Rxh7","Rc8#"] },
  { fen: "2rr4/q5bk/3p2p1/1R1N3p/2P1P3/8/4Q2P/6RK w - - 0 40", solution: ["Qxh5+","gxh5","Nf6+","Bxf6","Rxh5#"] },
  { fen: "5rk1/1p2Rp2/2r2Pp1/3p2P1/4Q3/1p6/qBPR4/2K5 w - - 0 36", solution: ["Qxg6+","fxg6","Rg7+","Kh8","Rh2#"] },
  { fen: "5rk1/p1R1B3/2ppp3/7R/8/1P6/P1P2nr1/2K5 b - - 0 34", solution: ["Nd3+","cxd3","Rf1#"] },
  { fen: "4r1k1/p1pb1p2/1p4pQ/4b1N1/6P1/5P2/PPq4P/R1B1RK2 b - - 0 28", solution: ["Bb5+","Kg1","Bxh2+","Qxh2","Rxe1#"] }
]

const CHECKMATE_PATTERNS_29 = [
  { fen: "6k1/1q5p/8/6r1/8/1r6/1P3R2/1K3Q2 w - - 0 1", solution: ["Rf8+","Kg7","Qf6#"] },
  { fen: "8/4R3/6k1/2Qb1pp1/1p6/1P4P1/5P1K/3q4 w - - 0 50", solution: ["Qd6+","Kh5","g4+","Kxg4","Qg3+","Kh5","Qh3+","Kg6","Qh7+","Kf6","Qg7#"] },
  { fen: "1r2q2r/p2b1R1p/2nkp1p1/6P1/3b4/6P1/P2B2BP/2RQ3K w - - 0 23", solution: ["Bf4+","e5","Rxc6+","Bxc6","Qxd4+","Ke6","Rf6+","Ke7","Qd6#"] },
  { fen: "3r4/pp3kpQ/5p1p/3q1b2/1B2N3/8/PP3PPP/4R1K1 w - - 0 26", solution: ["Ng5+","fxg5","Re7+","Kf6","Qxg7#"] },
  { fen: "k7/4rp1p/p1q3p1/Q1r2p2/1R6/8/P5PP/1R5K w - - 0 40", solution: ["Qd8+","Qc8","Rb8+","Ka7","Qb6#"] },
  { fen: "1q6/8/1r6/8/1r6/6k1/1P6/1K3R1Q w - - 0 1", solution: ["Rf3+","Kg4","Qh3+","Kg5","Rf5+","Kg6","Qh5+","Kg7","Rf7+","Kg8","Qh7#"] },
  { fen: "r2q4/pp3Q2/1np1p1pk/3nR2p/3P2P1/8/PPP4P/5RK1 w - - 0 24", solution: ["Rxh5+","gxh5","Qxh5+","Kg7","Rf7+","Kg8","Qh7#"] },
  { fen: "1k6/6r1/R7/1pp2p1p/1P1qpb2/8/2B4P/1K3Q2 w - - 0 46", solution: ["Qxb5+","Kc7","Qc6+","Kd8","Ra8+","Ke7","Re8+","Kf7","Qe6#"] },
  { fen: "6k1/6r1/p2Q2qp/5p2/5B1P/1Pp2K2/P7/2R5 b - - 0 37", solution: ["Qg2+","Ke3","Qe4+","Kf2","Rg2+","Kf1","Qe2#"] },
  { fen: "4R3/pb3p1k/1p3Pp1/2pq1pQp/5P1B/2Pr4/PP5P/6K1 b - - 0 34", solution: ["Qh1+","Kf2","Rf3+","Ke2","Qf1+","Kd2","Rd3+","Kc2","Qd1#"] }
]

const CHECKMATE_PATTERNS_30 = [
  { fen: "6k1/1q6/5Q2/8/1r4r1/3R4/1P6/1K6 w - - 0 1", solution: ["Rd8+","Kh7","Rh8#"] },
  { fen: "k7/1pr2p2/p3p1p1/4N1P1/1PP1Qn2/P5q1/K2R4/8 w - - 0 40", solution: ["Rd8+","Ka7","Qd4+","b6","Nc6+","Kb7","Rb8+","Kxc6","Rxb6#"] },
  { fen: "Q2N3k/p1r4p/4pbp1/4P3/8/7P/P1q2PP1/3R2K1 w - - 0 27", solution: ["Nf7+","Kg7","Qh8+","Kxf7","Qxf6+","Ke8","Rd8#"] },
  { fen: "6k1/pp4pp/2pb2rr/3p4/3PpP1q/4P1NP/PPR4K/2R1QN2 b - - 0 27", solution: ["Qxh3+","Kg1","Qh1+","Kf2","Qf3+","Kg1","Rh1#"] },
  { fen: "8/pp2Brbk/6pp/1P1Np2r/P1P5/3P1q2/1R3pRP/5Q1K b - - 0 36", solution: ["Rxh2+","Kxh2","Qh5+","Kg3","Rf3#"] },
  { fen: "8/1q6/8/1r6/6k1/1r6/1P3R1Q/1K6 w - - 0 1", solution: ["Rf4+","Kg5","Qh4+","Kg6","Rf6+","Kg7","Qh6+","Kg8","Rf8#"] },
  { fen: "8/5kbQ/R6p/1p6/3q1p2/8/1P3P2/K7 w - - 0 60", solution: ["Qg6+","Kf8","Ra8+","Ke7","Re8+","Kd7","Qe6+","Kc7","Rc8+","Kb7","Qc6+","Ka7","Ra8#"] },
  { fen: "7r/p3b1Q1/2p1k2p/4P2P/3R4/3P1P2/PP1q3P/1K6 w - - 0 34", solution: ["Qg6+","Kxe5","Re4+","Kd5","Qe6+","Kc5","Rc4+","Kb5","Qxc6+","Ka5","Ra4#"] },
  { fen: "3r2k1/Q1R2pp1/7p/8/4q3/6P1/1R5P/6K1 b - - 0 33", solution: ["Rd1+","Kf2","Qf5+","Ke3","Rd3+","Ke2","Qf3+","Ke1","Rd1#"] },
  { fen: "8/5rk1/1p4p1/1Pp1b3/4N2p/6PP/1P1QR2K/5q2 b - - 0 39", solution: ["hxg3+","Nxg3","Bxg3+","Kxg3","Rf3+","Kg4","Qxh3+","Kg5","Rf5#"] }
]

const SEED_BLOCKS_CHECKMATE_PATTERNS = [
  { name: "Basic Test", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_1 },
  { name: "Anastasia's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_2 },
  { name: "Greco's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_3 },
  { name: "Arabian Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_4 },
  { name: "Hook Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_5 },
  { name: "Vuković's mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_6 },
  { name: "Smothered Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_7 },
  { name: "Suffocation Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_8 },
  { name: "Corner Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_9 },
  { name: "Morphy's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_10 },
  { name: "Pillsbury's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_11 },
  { name: "Opera Mate / Mayet's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_12 },
  { name: "Lolli's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_13 },
  { name: "Damiano's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_14 },
  { name: "Max Lange's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_15 },
  { name: "Damiano's Bishop Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_16 },
  { name: "Dovetail Mate / Cozio's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_17 },
  { name: "Swallow's Tail Mate / Guéridon Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_18 },
  { name: "David & Goliath mate / Pawn mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_19 },
  { name: "Boden's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_20 },
  { name: "Balestra Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_21 },
  { name: "Double Knights Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_22 },
  { name: "Double Bishops Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_23 },
  { name: "Blackburne's Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_24 },
  { name: "Blind swine mate (rooks on the 7th rank)", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_25 },
  { name: "Epaulette Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_26 },
  { name: "Back Rank Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_27 },
  { name: "Lawnmower Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_28 },
  { name: "Triangle Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_29 },
  { name: "Kill Box Mate", description: "", category: "checkmate_patterns", puzzles: CHECKMATE_PATTERNS_30 }
]



// ─── WOODPECKER METHOD ─────────────────────────────────────────────────────────
const PUZZLE_PALOMITA_1 = [
  { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", solution: ["Z0"] },
  { fen: "r6r/1pp3k1/1b6/p2P1p2/P1N1pn2/2P2PP1/BP5P/4RR1K b - - 0 1", solution: ["Rxh2+","Kxh2","Rh8#"] },
  { fen: "rnb3kr/ppp4p/3b3B/3Pp2n/2BP4/3K1Rp1/PPP3q1/RN1Q4 w - - 0 1", solution: ["Rf8+","Bxf8","d6+","Be6","Bxe6#"] },
  { fen: "r2q1rk1/pppb1ppp/3b4/4p1P1/4Pn2/2N1B2P/PPPQBP2/2KR3R w - - 0 1", solution: ["Bxf4","exf4","e5"] },
  { fen: "2kr4/1pp4p/1p1r4/5Pp1/1P2q3/2P1R2P/P3KP2/1Q1R4 b - - 0 1", solution: ["Rd2+"] },
  { fen: "rn1qk2r/ppp2ppp/5n2/2b1p3/2B1P1b1/3P1N2/PPP3PP/RNBQK2R w KQkq - 0 1", solution: ["Bxf7+","Kxf7","Nxe5+"] },
  { fen: "r2k3r/pp1b3p/1qn1p1p1/1B1pPn2/Q7/P4N2/1P1BNPPP/2R3K1 w - - 0 1", solution: ["Rxc6","bxc6","Ba5"] },
  { fen: "2r1k2r/1b1p2q1/p4p2/4p3/PpB1Pp1p/7P/1PPRQPP1/4R1K1 b k - 0 1", solution: ["f3","Qxf3","Rxc4"] },
  { fen: "r3k2r/p1ppbppp/1pn1q3/4P3/2BP2n1/5NB1/1PP1Q1PP/R4K1R b kq - 0 1", solution: ["Qxc4","Qxc4","Ne3+","Ke2","Nxc4"] },
  { fen: "1b6/3n1p2/r1k1p1pp/Pr2P3/1PK2P2/3R4/3B2PP/R7 w - - 0 1", solution: ["Rxd7","Kxd7","Kxb5"] },
  { fen: "2b5/4Q1pp/pp3n1k/3p3q/P2P1P2/BP1B2P1/7P/6K1 w - - 0 1", solution: ["Qxf6+","gxf6","Bf8#"] },
  { fen: "4r2k/1b3Q1p/p1q3p1/1p4B1/2pb4/8/PPB3PP/5R1K w - - 0 1", solution: ["Be4","Qxe4","Bf6+","Bxf6","Qxf6+"] },
  { fen: "r1n5/pp2q1kp/2ppr1p1/4p1Q1/8/2N4R/PPP3PP/5RK1 w - - 0 1", solution: ["Qh6+","Kg8","Rf8+","Qxf8","Qxh7#"] },
  { fen: "4rrk1/ppp3pp/3p2n1/3Ppqb1/nPP5/6P1/P1NBQP1P/2R1NRK1 b - - 0 1", solution: ["Nc3","Bxc3","Bxc1"] },
  { fen: "2kr3r/p4pp1/2p4p/4p3/2n4q/1NPPnP1P/PP2Q2P/R1K2B1R b - - 0 1", solution: ["Rxd3","Bg2","Rhd8","a4","Rd1+","Rxd1","Rxd1+","Qxd1","Nxd1"] },
  { fen: "6k1/5pp1/p1n1r2p/2NQ4/1P1p4/P6P/1B1bqPP1/5RK1 b - - 0 1", solution: ["Qxf1+","Kxf1","Re1#"] },
  { fen: "r1bqk1nr/pppp3p/2n2p2/b5p1/2BPPp1P/2P2N2/P5P1/RNBQK2R w KQkq - 0 1", solution: ["Nxg5","fxg5","Qh5+","Ke7","Qf7+","Kd6","e5+","Nxe5","dxe5+","Kxe5","Qd5+","Kf6","Qxg5#"] },
  { fen: "2kr1bnr/p1ppqp1p/bpn5/1N4p1/P2PPp2/5N2/1PP2KPP/R1BQ1B1R w - - 0 1", solution: ["Nxa7+","Nxa7","Bxa6+"] },
  { fen: "rn1qk1nr/ppp2ppp/8/2b1p3/2B1P1b1/5N2/PPPP2PP/RNBQK2R w KQkq - 0 1", solution: ["Bxf7+","Kxf7","Nxe5+"] },
  { fen: "1k2r3/2p3p1/p4p2/1p3q1p/1n6/PQ2P3/1P2B2P/2KR4 b - - 0 1", solution: ["Rxe3","Qxb4","Rxe2"] },
  { fen: "r1bqkbnr/pppp3p/2n2p2/6p1/2BPPp2/5N2/PPP3PP/RNBQK2R w KQkq - 0 1", solution: ["Nxg5","fxg5","Qh5+","Ke7","Qf7+","Kd6","e5+","Nxe5","Qd5+","Ke7","Qxe5#"] },
  { fen: "rnbqkbnr/pppp3p/5p2/6p1/4Pp1P/5N2/PPPP2P1/RNBQKB1R w KQkq - 0 1", solution: ["Nxg5","fxg5","Qh5+","Ke7","Qxg5+","Ke8","Qh5+","Ke7","Qe5+"] },
  { fen: "rnbqkb1r/pp1p2pp/2p2p2/4p3/2B5/2P2N2/PPP2PPP/R1BQ1RK1 w kq - 0 1", solution: ["Nxe5","d5","Qh5+","g6","Nxg6","hxg6","Qxh8","dxc4","Re1+","Kf7","Bh6"] },
  { fen: "2r3k1/p3qppp/2pr4/Q2b4/1P2p3/4P3/P3BPPP/2RR2K1 w - - 0 1", solution: ["Rxd5","Rxd5","Qxd5"] },
  { fen: "6k1/2p3pp/q3pn2/1pp1p3/4P3/1P1P1P2/rNP2P1P/1Q3RK1 w - - 0 1", solution: ["Na4","Ra3","Qb2","b4","Qxe5"] },
  { fen: "8/1p3q1k/2p3pp/4P1r1/8/4Q3/PP5P/3R3K b - - 0 1", solution: ["Rxe5","Qxe5","Qf3+","Kg1","Qxd1+","Kf2","Qd7"] },
  { fen: "r5k1/1b1n2r1/p3n2q/1p1pPRN1/2pP3P/2P3P1/PPBQ4/5R1K w - - 0 1", solution: ["Rf6","Nxf6","Rxf6","Qh5","Bd1","Qe8","Rxe6"] },
  { fen: "r1b2rk1/p2p1p2/2p5/1p2PPqn/1b1p2N1/1B1P3Q/PPP3PP/R4RK1 w - - 0 1", solution: ["Qxh5","Qxh5","Nf6+","Kg7","Nxh5+"] },
  { fen: "r5r1/p1p1k3/3q3B/5p2/4p3/1P6/P1P1QPP1/R4RK1 b - - 0 1", solution: ["Rxg2+","Kxg2","Rg8+","Kh1","Qxh6+","Qh5","Qxh5#"] },
  { fen: "6rk/p1q2p2/2p1rb1P/1p2pN2/4P1Q1/2PP4/PPB5/2K4R w - - 0 1", solution: ["Qg7+","Rxg7","hxg7+","Kg8","Rh8#"] },
  { fen: "4q1k1/2r3pp/1p6/8/1b2N3/4R1P1/PP3P1P/R5K1 w - - 0 1", solution: ["Nf6+","gxf6","Rxe8+"] },
  { fen: "4k3/1bp4r/p7/1p1P4/2P3pN/1P2r1P1/1BP2RPK/8 b - - 0 1", solution: ["Rxh4+","gxh4","g3+","Kg1","gxf2+","Kxf2"] },
  { fen: "2q4k/5Qp1/4B2p/p1p5/1P6/6PK/r4P1P/8 b - - 0 1", solution: ["Rxf2","Qxf2","Qxe6+"] },
  { fen: "5Rnk/pp1q4/7p/3p2rN/3Pp1Q1/2P5/PP5P/6K1 w - - 0 1", solution: ["Qxg5","hxg5","Rxg8+","Kxg8","Nf6+","Kf7","Nxd7"] },
  { fen: "r1bq2k1/pp3rpp/2n2b2/3p1p2/3P4/BQPB1N2/P4PPP/R3R1K1 w - - 0 1", solution: ["Qxd5","Qxd5","Re8+","Rf8","Rxf8#"] },
  { fen: "2r3k1/pb2bp1p/1p2p1p1/8/q1NPP3/3B4/P3QPPP/3R2K1 b - - 0 1", solution: ["Bxe4","Bxe4","Rxc4"] },
  { fen: "6r1/2r1k3/R3p3/p4pPp/1pPK1P2/1P3B1P/P7/8 w - - 0 1", solution: ["Rxe6+","Kxe6","Bd5+","Kd6","Bxg8","Re7","c5+","Kc6","Bd5+","Kb5","g6"] },
  { fen: "r4r1k/pppqNppp/3p1B2/4p3/3nP3/3P1b2/PPPQ1PPP/R4RK1 w - - 0 1", solution: ["Bxg7+","Kxg7","Qg5+","Kh8","Qf6#"] },
  { fen: "3r2k1/2p2pp1/p1Q2n1p/7q/8/1P1N2P1/P1P2P2/R3K3 b - - 0 1", solution: ["Rxd3","cxd3","Qe5+","Kd2","Qxa1"] },
  { fen: "r1b2rk1/pp3qpp/2p1p3/2Ppb1PP/5B2/3BP3/PP3Q2/2R1K2R w K - 0 1", solution: ["Bxh7+","Kh8","Bg6"] },
  { fen: "2r2rk1/pQ1n1pp1/1p2p2p/3p4/P2P4/4P2P/1qB2PP1/2R2RK1 w - - 0 1", solution: ["Bh7+","Kxh7","Rxc8","Rxc8","Qxc8"] },
  { fen: "3k4/p1p2prr/1p5N/3PRPP1/b1P5/4B3/P4K2/8 w - - 0 1", solution: ["f6","Rg6","Bf4"] },
  { fen: "r3k2r/pbp2qb1/1pn1p2p/3nP1pQ/3PNp2/2PB4/PP1N1BPP/R4RK1 w kq - 0 1", solution: ["Nd6+","cxd6","Bg6"] },
  { fen: "4k3/1r2r1pp/1nR2p2/pp1p4/1N1P2P1/1R2PP2/PP3K1P/8 w - - 0 1", solution: ["Rxb6","axb4","Rxb7","Rxb7","Rxb4"] },
  { fen: "7r/1p3pp1/pn1kb2p/3p4/3N1P1P/PP1BP3/3K2P1/2R5 w - - 0 1", solution: ["Bxa6","bxa6","Rc6+","Ke7","Rxb6"] },
  { fen: "r3nrk1/1bp2ppp/pp2p3/3q2N1/1b1PNP2/3B2P1/PP2QP1P/2RR2K1 w - - 0 1", solution: ["Nxh7","f5","Nhg5","fxe4","Bxe4"] },
  { fen: "r1b1k2r/2qp1ppp/ppnbpn2/8/2PNP3/P1N1BP2/1P4PP/2RQKB1R w Kkq - 0 1", solution: ["Ndb5","axb5","Nxb5","Bg3+","hxg3","Qxg3+","Bf2"] },
  { fen: "4r1k1/6qp/pp4p1/2pP4/4Pp2/1P6/P1R3PP/4Q2K b - - 0 1", solution: ["Rxe4","Qxe4","Qa1+"] },
  { fen: "2bq1r2/4bpk1/4pp1N/7Q/1p1p4/3B4/PP3PPP/R5K1 w - - 0 1", solution: ["Nxf7","Rxf7","Qh7+","Kf8","Qh8#"] },
  { fen: "r3r1k1/3b2pp/2p5/p1RpPp2/3Q1P2/1q2P1P1/6BP/R5K1 w - - 0 1", solution: ["Rxd5","cxd5","Bxd5+"] },
  { fen: "r3br1k/pp5p/4B1p1/4NpP1/P2Pn3/q1PQ3R/7P/3R2K1 w - - 0 1", solution: ["Rxh7+","Kxh7","Qh3+","Kg7","Qh6#"] }
]

const PALOMITA_2 = [
  { fen: "5rk1/ppp2ppp/6q1/2b1P3/3r4/2N1BQ1b/PP3PPP/R3R1K1 b - - 0 1", solution: ["Bxg2","Qg3","Rg4","Bxc5","Rxg3","fxg3","Re8"] },
  { fen: "4r2k/ppp3pp/8/1PPb1p2/3P1P1b/P1Q2p1P/7R/R4KBq b - - 0 1", solution: ["Qg2+","Rxg2","fxg2#"] },
  { fen: "3r1b1k/pp4p1/2p1Qp2/5N2/PP2Pp2/2Pq4/5PKP/5R2 b - - 0 1", solution: ["f3+","Kg1","Qxf1+","Kxf1","Rd1#"] },
  { fen: "r1b2rk1/pp4pp/2pb4/3p1pq1/2PP4/1N1BPR2/PPQ3PP/4R1K1 b - - 0 1", solution: ["Bxh2+","Kxh2","Qh4+","Rh3","Qxe1"] },
  { fen: "q6r/1b4bp/4k1p1/1p2Pn2/2pPp1Q1/2P5/1P1N2PP/2B2RK1 w - - 0 1", solution: ["Rxf5","gxf5","Qxg7"] },
  { fen: "5rk1/1b1p1ppp/1qr1p3/p2pP3/P4P2/Q2B4/1PP3PP/R4R1K w - - 0 1", solution: ["Bxh7+","Kxh7","Qxf8"] },
  { fen: "5r1k/pp4pp/2p5/8/4n3/5NPQ/P3Bq1P/4R2K b - - 0 1", solution: ["Qxe1+","Nxe1","Nf2+","Kg2","Nxh3","Nf3","Rxf3","Bxf3","Ng5"] },
  { fen: "r4rk1/pp2bppp/1qp1p3/4Pb2/Q1P1nB2/2N5/PP1RBPPP/5RK1 w - - 0 1", solution: ["Nxe4","Bxe4","c5","Bxc5","Qxe4"] },
  { fen: "2r5/pp1bkp1Q/2nbpq2/3p1p2/3P1Pr1/2NBP1N1/PP4PP/2R2RK1 w - - 0 1", solution: ["Nxf5+","exf5","Nxd5+"] },
  { fen: "r1bqr1k1/1p1nbpp1/p1p3p1/3p4/3P1B2/2NBP2P/PP3PP1/2RQ1RK1 w - - 0 1", solution: ["Nxd5","cxd5","Bc7"] },
  { fen: "3r2k1/q1p1nppp/p3n3/1pb1p3/4P2N/1PP3PP/PBB1QPK1/7R b - - 0 1", solution: ["Bxf2","Qxf2","Qxf2+","Kxf2","Rd2+","Ke3","Rxc2"] },
  { fen: "1Q6/p4pkp/3p2p1/3P4/q7/P3rBbP/6P1/5R1K b - - 0 1", solution: ["Rxf3","gxf3","Qc2"] },
  { fen: "r1bqk2r/p1pn1pp1/1p2pn1p/8/3P4/B1PB4/P1P1QPPP/R3K1NR w KQkq - 0 1", solution: ["Qxe6+","fxe6","Bg6#"] },
  { fen: "r2qk2r/1p1b1pp1/p1pBpn1p/2P1N3/1n1P4/3B4/PPQ2PPP/2KR3R w kq - 0 1", solution: ["Bg6","fxg6","Qxg6#"] },
  { fen: "1r2r1k1/p1pbqppp/Q2b1n2/3p4/P2P4/2P5/1P2BPPP/R1B1KN1R b KQ - 0 1", solution: ["Bb5","axb5","Qxe2#"] },
  { fen: "1r4k1/pqp2pbp/2Q2np1/1N2p3/8/1P5P/PBP2PP1/3R2K1 w - - 0 1", solution: ["Rd8+","Bf8","Qxf6"] },
  { fen: "rn1qkb1r/pp3p1b/2p1pnpp/4N3/2B4P/6N1/PPPPQPP1/R1B1K2R w KQkq - 0 1", solution: ["Nxf7","Kxf7","Qxe6+"] },
  { fen: "3n4/2prR1pk/p2r1p1p/1p5P/5P1P/P1B2K2/1PP5/4R3 w - - 0 1", solution: ["Bxf6"] },
  { fen: "6r1/1p2R3/p5k1/2p5/4Nr1P/8/PP5P/6K1 b - - 0 1", solution: ["Rxe4","Rxe4","Kf5+","Kf2","Kxe4"] },
  { fen: "r1b2rk1/ppqnbppp/2p1pn2/3p2B1/2PP4/2NBPN2/PPQ2PPP/R3K2R w KQ - 0 1", solution: ["Bxh7+","Nxh7","Bxe7","Re8","Bh4","dxc4"] },
  { fen: "r1b1qrk1/pppp1ppp/1bn3n1/3Np1BQ/2B1P3/3P1N2/PPP2PPP/R3K2R w KQ - 0 1", solution: ["Nf6+","gxf6","Bxf6"] },
  { fen: "r2qrbk1/1bp2ppp/p2p1n2/2p2NB1/4P3/2N2Q2/PPP2PPP/R3R1K1 w - - 0 1", solution: ["Nh6+","gxh6","Bxf6"] },
  { fen: "r4r1k/ppn1NBpp/4b3/4P3/3p1R2/1P6/P1P3PP/R5K1 w - - 0 1", solution: ["Ng6+","hxg6","Rh4#"] },
  { fen: "2r2rk1/pp1bnp2/3q1n1Q/3p1P2/4p2N/1BPP4/P1P3PP/R4RK1 b - - 0 1", solution: ["Qxh2+","Kxh2","Ng4+","Kg3","Nxh6"] },
  { fen: "5rk1/pbp2ppp/qr6/8/5Q2/1PP5/P4PP1/R1B2RK1 b - - 0 1", solution: ["Bxg2","Kxg2","Rg6+"] },
  { fen: "r1b2rk1/pp1p1ppp/2n2n2/q7/2P5/P1N2NP1/3QPKBP/R1B4R b - - 0 1", solution: ["Qxc3","Qxc3","Ne4+","Kf1","Nxc3"] },
  { fen: "3Q4/p4pkp/1p3np1/2q5/4p3/4P1N1/PP3PPP/6K1 w - - 0 1", solution: ["Qxf6+","Kxf6","Nxe4+","Ke5","Nxc5","bxc5","Kf1"] },
  { fen: "3r4/p2q1pkp/1pn1bnp1/2p1p3/P1N1P3/1PP1Q1PP/5PK1/4RBN1 b - - 0 1", solution: ["Nxe4","Qxe4","Bd5"] },
  { fen: "2kr4/p1p2ppp/3rb3/8/2P5/1R1BR3/P4PPP/5K2 b - - 0 1", solution: ["Rxd3","Rexd3","Rxd3","Rxd3","Bxc4","Ke2"] },
  { fen: "6k1/3q3p/p1p3pQ/1p1p4/3P2RP/1P3P2/r3r1P1/5R1K b - - 0 1", solution: ["Rxg2","Rxg2","Qh3+","Kg1","Qxg2#"] },
  { fen: "6k1/6pp/p1p3r1/3p4/P2P1Pq1/1R2PR2/2Q1K1P1/7r b - - 0 1", solution: ["Qxg2+","Rf2","Qxf2+","Kxf2","Rh2+","Kf3","Rxc2"] },
  { fen: "1r2nrk1/p1p2pp1/4bb1p/3p4/q4B2/P1PB1Q1P/1P2NPP1/1R1R2K1 b - - 0 1", solution: ["Rxb2","Rxb2","Qxd1+"] },
  { fen: "5rk1/p4ppp/b3p3/2n1N3/Pp2P3/1P1r4/3N1PPP/R2R2K1 b - - 0 1", solution: ["Rxd2","Rxd2","Nxb3"] },
  { fen: "2r1r2k/p4pp1/2pBnb1p/q1Pp4/3P4/P2R4/2Q1NPPP/3R2K1 b - - 0 1", solution: ["Nxd4","Rxd4","Bxd4","Rxd4","Qe1#"] },
  { fen: "r1bn1b1r/pp2k1pp/5p2/1B2p3/5B2/5N2/PPP2PPP/2KR3R w - - 0 1", solution: ["Nxe5","Ne6","Nd3"] },
  { fen: "2r2rk1/5ppp/p1pp4/2p1n1q1/4P2b/1PN4P/PBPRQPP1/R5K1 b - - 0 1", solution: ["Nf3+","Qxf3","Qxd2"] },
  { fen: "8/2q3pk/1p2p2p/2n5/2B5/P3PQ2/5PKP/8 w - - 0 1", solution: ["Bxe6","Nxe6","Qf5+","Kh8","Qxe6"] },
  { fen: "r7/3k3p/6p1/N1P2p2/1p2p2P/3bPP2/5KP1/R7 b - - 0 1", solution: ["Rxa5","Rxa5","b3"] },
  { fen: "4rrk1/pp2p3/2pqP1p1/4Rp1p/P2P1n1P/6Q1/1P3PP1/1N1R2K1 b - - 0 1", solution: ["Qxe5","dxe5","Ne2+","Kh2","Nxg3"] },
  { fen: "3r2k1/2q1b2p/ppnpPpp1/2pB4/2P2PPB/PP1R3P/3Q4/6K1 w - - 0 1", solution: ["Bxf6","Bxf6","e7+","Kg7","exd8=Q"] },
  { fen: "3r2k1/p1q2pbp/1pn1p1p1/2p5/4P3/4B1P1/PPP1RPBP/2Q4K b - - 0 1", solution: ["Bxb2","Qxb2","Rd1+","Bf1","Rxf1+","Kg2","Rd1"] },
  { fen: "1k6/pp3pp1/rr6/3p2Np/2pPnP2/q1P1P2P/P1R3P1/K1QR4 b - - 0 1", solution: ["Nxc3","Qxa3","Rxa3"] },
  { fen: "r3r1k1/ppp2ppp/2nb1q2/6Rn/2BP4/P1NQBP1P/1P3P2/2KR4 b - - 0 1", solution: ["Rxe3","Qxe3","Bf4"] },
  { fen: "7k/p6p/6p1/2b2b2/2P5/2R1pBP1/P2rR1KP/8 b - - 0 1", solution: ["Be4","Bxe4","Rxe2+"] },
  { fen: "3q3k/1pp3pp/5p2/1P6/4PQ2/3B2P1/1r3b1P/R6K w - - 0 1", solution: ["Qxc7"] },
  { fen: "r4rk1/p3qpp1/2p2n2/3pb2p/3Q2B1/1PN1P3/PB3PPP/2R2RK1 w - - 0 1", solution: ["Nxd5","cxd5","Qxe5","Qxe5","Bxe5"] },
  { fen: "r4rk1/pp1b3p/2p4q/3p1p2/3P2n1/2NBP1PR/PP3PK1/R2Q4 b - - 0 1", solution: ["Qxh3+","Kxh3","Nxf2+","Kg2","Nxd1"] },
  { fen: "r3kr2/1p1b1pp1/p1n1p2p/8/4q3/1N6/PPP1BKPP/R2Q1R2 w q - 0 1", solution: ["Qxd7+","Kxd7","Nc5+","Ke7","Nxe4"] },
  { fen: "4r1k1/5p1p/2Qb2p1/3P4/6Pn/2N1B2P/1P3P1q/3R1K2 b - - 0 1", solution: ["Rxe3","fxe3","Qg2+","Ke1","Nf3#"] },
  { fen: "r1b1k2r/1p3pp1/p3pn2/2p1q1N1/8/1B2P3/PPP1Q2P/2KR3R w kq - 0 1", solution: ["Rd8+","Ke7","Rxh8","Qxg5","Qd2"] },
  { fen: "6k1/1pqrnp2/3p2p1/2pn2b1/P1Q3Pp/2B4P/1PP1RP2/4R1K1 w - - 0 1", solution: ["Qxd5","Nxd5","Re8+","Kh7","Rh8#"] }
]

const PALOMITA_3 = [
  { fen: "6k1/1p3pp1/p7/P2n1PQ1/8/8/1r3r1P/3R3K b - - 0 1", solution: ["Rxh2+","Kg1","Rbg2+","Qxg2","Rxg2+","Kxg2","Ne3+","Kf3","Nxd1"] },
  { fen: "1r4k1/2qpn1pp/p1p1pr2/2b5/2P2P2/3B4/PP4PP/R1BQ1R1K w - - 0 1", solution: ["Bxh7+","Kxh7","Qh5+","Rh6","Qxc5"] },
  { fen: "1rq1r2k/5Rbp/p2p1p1B/2p1p3/2P1P2Q/1P6/P5PP/3b2K1 w - - 0 1", solution: ["Bxg7+","Kg8","Bh8","Kxf7","Qxf6+","Kg8","Qg7#"] },
  { fen: "5bk1/p2Q1p2/q4p2/4r2p/3pr3/8/PPRRNPPP/5K2 b - - 0 1", solution: ["Rxe2","Rxe2","d3","Rxe5","dxc2+"] },
  { fen: "6k1/q4pp1/4p2p/1p1r4/1PpPQ3/r1P1R1P1/4RP1P/6K1 b - - 0 1", solution: ["Rxc3","Rxc3","Qa1+","Kg2","Qxc3"] },
  { fen: "r2qk2r/pp1n1ppb/2pbpn1p/4N3/2BP1P1P/6N1/PPP1Q1P1/R1B1K2R w KQkq - 0 1", solution: ["Nxf7","Kxf7","Qxe6+","Kf8","Qf7#"] },
  { fen: "1r4k1/5n1p/5qp1/1p6/3Q4/1P4PP/P3rPB1/R2R2K1 b - - 0 1", solution: ["Re1+","Kh2","Qxd4","Rxd4","Rxa1"] },
  { fen: "r3r1k1/1p5p/p1pqn1p1/3p1p2/PP1P1P2/1Q1RP3/4B1PP/1R4K1 b - - 0 1", solution: ["Nxf4","exf4","Rxe2"] },
  { fen: "3r2k1/p2r1p2/4b1p1/qPp1R2p/P1p4P/8/5PP1/Q3RBK1 w - - 0 1", solution: ["Bxc4","Bxc4","Re8+","Rxe8","Rxe8+","Kh7","Rh8#"] },
  { fen: "3r2k1/5qpp/pp2r3/2p2b2/nPPp1PP1/P4Q2/3N3P/R3RBK1 b - - 0 1", solution: ["Bxg4","Qxg4","Rg6"] },
  { fen: "6k1/1q1rbpp1/7p/1p1p1P2/1P2p1P1/P1Q5/4B2P/3R2K1 b - - 0 1", solution: ["d4","Rxd4","Qb6"] },
  { fen: "2r1b1k1/r1N2p1p/1p2p1pn/p2pP3/1b1P2P1/1P3N1P/P1R2P2/2R2BK1 w - - 0 1", solution: ["Nxd5","Rxc2","Nf6+","Kf8","Rxc2"] },
  { fen: "r4rk1/2n1q2p/b1n1p1p1/pp1pPpN1/P1pP1N1P/2P3P1/1P3PB1/R2QR1K1 w - - 0 1", solution: ["Nfxe6","Nxe6","Bxd5"] },
  { fen: "3r1n1k/3P3p/pp3q2/2pQp3/P1P3B1/3b2R1/1P5P/6K1 w - - 0 1", solution: ["Qg8+","Kxg8","Be6+","Kh8","Rg8#"] },
  { fen: "6k1/5r1p/p2N4/nppP2q1/2P5/1P2N3/PQ5P/7K w - - 0 1", solution: ["Qh8+","Kxh8","Nxf7+","Kg7","Nxg5"] },
  { fen: "Q7/2r2rpk/2p4p/7N/3PpN2/1p2P3/1K4R1/5q2 w - - 0 1", solution: ["Rxg7+","Rxg7","Nf6#"] },
  { fen: "6rk/p3p2p/1p2Pp2/2p2P2/2P1nBr1/1P6/P6P/3R1R1K b - - 0 1", solution: ["Rg1+","Rxg1","Nf2#"] },
  { fen: "8/pr1r3p/6p1/2p1pk2/3b2N1/1P4P1/P2R1PKP/4R3 w - - 0 1", solution: ["Rxd4","Rxd4","Rxe5+","Kxg4","f3#"] },
  { fen: "r5k1/pp1b2pp/4q3/n7/3Rp3/P7/5QPP/2B2RK1 w - - 0 1", solution: ["Rxe4","Qxe4","Qf7+","Kh8","Qf8+","Rxf8","Rxf8#"] },
  { fen: "r1bq1rk1/pp2ppbp/2n3p1/2pn4/3p1P2/NP2PN2/PBPPB1PP/3RQRK1 b - - 0 1", solution: ["d3","Bxg7","dxe2"] },
  { fen: "8/4r1k1/4qp2/1p6/3R4/P1N2QPp/1PP2K1P/4r3 b - - 0 1", solution: ["Rf1+","Kxf1","Qe1#"] },
  { fen: "2kr3r/pbpq4/1p5p/4PpP1/P2p4/2P2Q2/2P2P2/R1B1KB1R w KQ - 0 1", solution: ["Ba6","Bxa6","Qa8#"] },
  { fen: "8/4r1p1/p2k1p1p/1bNp3P/3P1K2/2P2P2/6P1/1R6 w - - 0 1", solution: ["Nxa6","Bxa6","Rb6+","Kd7","Rxa6"] },
  { fen: "4kb1r/1br4p/p3p1p1/1p3R2/1n2p3/PNN1B3/1PP3PP/2R3K1 w k - 0 1", solution: ["Rxf8+","Rxf8","axb4"] },
  { fen: "8/4k1p1/1p2pp1p/p6P/2n1PN2/4qPP1/1P4K1/3Q4 b - - 0 1", solution: ["Qxf4","gxf4","Ne3+","Kg3","Nxd1"] },
  { fen: "8/5r1k/p3Npp1/4p3/3nP3/4QP2/PP2q1P1/1KR5 w - - 0 1", solution: ["Qh6+","Kxh6","Rh1#"] },
  { fen: "3Rb3/6kp/6p1/3P1p2/3q4/Q5PP/P1r1r1B1/6RK b - - 0 1", solution: ["Qxg1+","Kxg1","Rxg2+","Kh1","Rh2+","Kg1","Rcg2+","Kf1","Bb5+","Ke1","Rh1#"] },
  { fen: "2r2nk1/p2q1pp1/1p2b2p/3p4/3P1P2/4R1P1/PP1Q3P/1B2R1K1 w - - 0 1", solution: ["f5","Bxf5","Re7"] },
  { fen: "b2r4/p4Brk/1pqp1Qp1/2p2pPp/5P2/3P4/PP5P/2B1RRK1 w - - 0 1", solution: ["Bxg6+","Rxg6","Re7+","Kg8","Qxg6+","Kf8","Qg7#"] },
  { fen: "2kn3r/pp1b4/2n1p1p1/q2pP1P1/2pN1P2/P1P3K1/2PB4/R2Q3B b - - 0 1", solution: ["Rxh1","Qxh1","Nxd4","cxd4","Qxd2"] },
  { fen: "7k/8/7P/6K1/6Q1/6P1/7q/8 b - - 0 1", solution: ["Qxh6+","Kxh6"] },
  { fen: "r4rk1/pp5p/2pp4/2n3q1/2b2p1R/2N3P1/PP1QPPB1/2KR4 b - - 0 1", solution: ["Bxa2","Nxa2","Nb3+"] },
  { fen: "2q4k/p6p/6p1/5p2/5P1P/1Bb2QP1/Pr6/3R2K1 w - - 0 1", solution: ["Rd8+","Qxd8","Qxc3+","Qf6","Qxf6#"] },
  { fen: "3r2k1/5rbp/pp3np1/3P4/1B1N1R2/8/P5PP/5RK1 b - - 0 1", solution: ["Nxd5","Ne6","Nxf4","Rxf4","Rxf4"] },
  { fen: "r1bqr1k1/p1p2ppp/3b1n2/2P3B1/8/2NQ1N2/PP3PPP/R4RK1 b - - 0 1", solution: ["Bxh2+"] },
  { fen: "r4rk1/2p3b1/3p2qp/p1PPp3/4Rn2/P5Q1/3B1NPP/2R3K1 b - - 0 1", solution: ["Qxe4","Nxe4","Ne2+","Kh1","Nxg3+"] },
  { fen: "2rq1rk1/pp3pb1/3p2pB/n4P2/4pP2/1BNQ4/PKP3P1/3R3R w - - 0 1", solution: ["Bxg7","exd3","f6","dxc2","Rh8#"] },
  { fen: "rr4k1/1q3p2/4b2p/p2n2p1/2B5/Q3P3/PP1R1PPP/3R2K1 b - - 0 1", solution: ["Nxe3","Qxe3","Bxc4"] },
  { fen: "3r1rk1/ppp1qpp1/2p1b2p/4P3/3nNQ1P/5N2/PPP2PP1/R4RK1 w - - 0 1", solution: ["Nxd4","Rxd4","Nf6+","Qxf6","Qxd4","Rd8","Qe4","Bd5","Qxd5"] },
  { fen: "2brrbk1/2q2p1p/p4np1/1ppPp3/4P3/BP2N1P1/P3QPBP/2RR2K1 w - - 0 1", solution: ["Bxc5","Bxc5","b4","Nd7","bxc5","Nxc5","Qc2"] },
  { fen: "r4rk1/ppp1bppp/2N2n2/7q/6b1/2P5/PP1NBPPP/R1B1QRK1 b - - 0 1", solution: ["Bd6","h3","Bxe2","Nd4","Bxf1"] },
  { fen: "r1nq1n2/3b2k1/p2p1p1R/Pp1Pp1p1/1Pp1P1P1/2P1BPN1/2BQ2K1/8 w - - 0 1", solution: ["Rxf6","Qxf6","Nh5+"] },
  { fen: "4rbk1/3Q1ppp/3p4/3P4/5q2/B7/P5PP/5RK1 b - - 0 1", solution: ["Qd4+","Kh1","Qf2"] },
  { fen: "r1b5/5pk1/1p1p3p/3Pq1p1/PQ2Pn2/5P2/5RPP/3R3K b - - 0 1", solution: ["Nd3","Qxb6","Nxf2+","Qxf2"] },
  { fen: "6rk/7p/p2Q4/1p2r3/8/4NP1q/PPP4P/5R1K b - - 0 1", solution: ["Qxh2+","Kxh2","Rh5#"] },
  { fen: "1r2b1k1/R4nqp/4p3/1pR5/1P1P1r2/5N2/1Q2B1P1/6K1 w - - 0 1", solution: ["Rg5","Qxg5","Nxg5","Nxg5","d5"] },
  { fen: "2rb1qk1/1b4pp/3p4/1P2pr2/2n2PB1/2NQ2P1/P1N4P/R2R2K1 b - - 0 1", solution: ["Bb6+","Kf1","Rxf4+","gxf4","Qxf4+"] },
  { fen: "8/2b2k1p/pp1P3r/2p3p1/6P1/1P2R2P/5P2/6K1 w - - 0 1", solution: ["Re7+","Kf8","dxc7","Rc6","Rd7","Ke8","Rd8+","Ke7","c8=Q","Rxc8","Rxc8"] },
  { fen: "r3rnk1/1N3ppp/1p6/p1Pp2q1/8/6P1/PP2PPBP/2R1Q1K1 b - - 0 1", solution: ["Rxe2","Qxe2","Qxc1+","Qf1","Qd2","cxb6","Rc8"] },
  { fen: "8/6k1/1P1p2p1/3Ppn2/3q4/8/6PP/rR2QB1K b - - 0 1", solution: ["Ng3+","hxg3","Ra8"] },
  { fen: "8/7R/2r5/8/P3n3/8/3nk1PP/R5K1 b - - 0 1", solution: ["Nf3+","gxf3","Rg6+","Kh1","Nf2#"] }
]

const PALOMITA_4 = [
  { fen: "3rrk2/R4ppB/7p/1p2N1q1/nPbP1p2/2PQ1P2/6PP/4R1K1 w - - 0 1", solution: ["Qxc4","bxc4","Rxf7#"] },
  { fen: "5kr1/5p2/8/1Q1bPp2/8/P5P1/q1rBBK1P/3R4 w - - 0 1", solution: ["Qxd5","Qxd5","Bh6+","Ke7","Rxd5"] },
  { fen: "3rrnk1/1bq2pp1/ppnppb1p/8/2P1PPQ1/1PN2N2/PB4PP/1B1R1R1K w - - 0 1", solution: ["Nd5","Bxb2","Nxc7"] },
  { fen: "1n3rk1/p2pQpp1/4q2p/1r6/4B3/4P1P1/P4P1P/2RR2K1 w - - 0 1", solution: ["Bh7+","Kxh7","Qxf8"] },
  { fen: "4R3/p4pk1/5qpp/1PnP4/3Q3P/6P1/r1r1BPK1/3R4 w - - 0 1", solution: ["Rg8+","Kxg8","Qxf6"] },
  { fen: "4rrk1/1p1n1pb1/2ppq1p1/p3p1Bp/P1P1P2P/2NP2P1/1P2QPK1/3R1R2 w - - 0 1", solution: ["Nd5","Nc5","Nc7","Qd7","Nxe8"] },
  { fen: "r3rbk1/1b3Npp/1q1p2n1/2pP4/5R2/1PN3Q1/4P1BP/5R1K w - - 0 1", solution: ["Qxg6","hxg6","Rh4"] },
  { fen: "5nk1/1b1qQpp1/p3p3/3pP1N1/3P3P/1p1B4/1P3PP1/6K1 w - - 0 1", solution: ["Bh7+","Nxh7","Qxd7"] },
  { fen: "4r2k/3n2bB/2p1NqQ1/2Pp4/5B2/r6P/5PP1/4R1K1 b - - 0 1", solution: ["Rxe6","Rxe6","Ra1+","Kh2","Qxf4+"] },
  { fen: "2b4k/p3q2p/2p1p3/2PpPpr1/3P3Q/4P2B/3b1B1P/R6K b - - 0 1", solution: ["Bxe3","Bxe3","Rg1+","Rxg1","Qxh4","Bg5","Qe4+","Bg2","Qxd4","Bf6+","Kg8"] },
  { fen: "7r/3b1pk1/2p2qp1/8/1P1bNP2/r2B4/3Q2PP/2R2R1K b - - 0 1", solution: ["Rxh2+","Kxh2","Qh4#"] },
  { fen: "1r1r4/5ppk/1p5p/2b1Pp1Q/8/q7/3B1PPP/2RR2K1 b - - 0 1", solution: ["Rxd2","Rxd2","Qxc1+"] },
  { fen: "4kr2/p1Bbpp2/1p4p1/n6p/2B1P2P/2K2P2/P2R2P1/8 w - - 0 1", solution: ["Bb5","Bxb5","Rd8#"] },
  { fen: "2n2k2/2b2pp1/2p1pnp1/2Pp2N1/3P1PP1/3BP2P/3BK3/8 w - - 0 1", solution: ["Bxg6","Bxf4","exf4","fxg6","Nxe6+"] },
  { fen: "r5k1/pb1p1Rpq/2n1p1Q1/1p2P3/3P2P1/P7/1P1K4/5R2 w - - 0 1", solution: ["Rf8+","Rxf8","Rxf8+","Kxf8","Qxh7"] },
  { fen: "1k1r1q1r/2p2ppp/Qp6/3b1N2/8/P5P1/1P3P1P/2R2RK1 w - - 0 1", solution: ["Rxc7","Kxc7","Qa7+"] },
  { fen: "6k1/4qp2/1B4pp/2R1b3/P2Nb3/1P2Q3/r4PPP/6K1 b - - 0 1", solution: ["Qxc5"] },
  { fen: "R3n1k1/7p/3prppB/1p2p3/1P2P2Q/7P/5PPK/1q6 w - - 0 1", solution: ["Rxe8+","Rxe8","Qxf6"] },
  { fen: "2rr4/pp4kp/6p1/3nNp2/2B5/2n3P1/P2R1PKP/R7 b - - 0 1", solution: ["Ne3+"] },
  { fen: "5rk1/ppr2Npp/2q1Pp2/3n4/8/6Q1/P5PP/3R1R1K w - - 0 1", solution: ["Rxd5","Qxd5","Qxc7"] },
  { fen: "r7/5kpp/2p1pq2/1bP2p2/p4Q2/5BP1/PP3P1P/4R1K1 w - - 0 1", solution: ["Bxc6","Bxc6","Qc7+","Qe7","Qxc6"] },
  { fen: "8/1p3pkp/pb2p1p1/8/4P2P/1N4P1/P1R1KP2/7r b - - 0 1", solution: ["Bxf2","Kxf2","Rh2+"] },
  { fen: "2r5/pp1b4/4p3/3pPk2/5P2/8/1K6/3R2R1 w - - 0 1", solution: ["Rd4"] },
  { fen: "r2r2k1/1p1n1bpp/1pp1pp2/8/Pb1PP1P1/1BNRBP1P/1P3K2/2R5 b - - 0 1", solution: ["Nc5","dxc5","Rxd3"] },
  { fen: "8/1R3pbp/4p1k1/5p2/8/2N2P2/1P1r1P1P/4K3 b - - 0 1", solution: ["Rxb2","Rxb2","Bxc3+"] },
  { fen: "5k1r/ppq3b1/8/3Pp2p/3n4/7Q/PP3PPP/3RR1K1 w - - 0 1", solution: ["Rxd4","exd4","Qf5+","Qf7","Qc8+","Qe8","Qxe8#"] },
  { fen: "r3qn1k/pp3pp1/2b1p2p/4P1BP/2B3Q1/8/PPP3P1/2K1R3 w - - 0 1", solution: ["Bf6","gxf6","exf6"] },
  { fen: "3r2k1/1b3p1p/pp4p1/4PqP1/3NpP2/1P2Q2P/P6K/2R5 b - - 0 1", solution: ["Rxd4"] },
  { fen: "4r1rk/p3q2p/3p1n1Q/3P4/Pp1n1P2/3BN2R/1PPK1P2/R7 w - - 0 1", solution: ["Qxf6+","Qxf6","Rxh7#"] },
  { fen: "2kr3r/1pq3p1/p1p3Qp/P1n1p3/8/RbN1P1P1/1P2P1BP/5RK1 w - - 0 1", solution: ["Rxb3","Nxb3","Qe6+","Kb8","Qxb3"] },
  { fen: "2rq1rk1/1p4bp/4p1p1/p2p1bP1/P2N4/2PnB3/QP4BP/R5RK b - - 0 1", solution: ["Qxg5","Bxg5","Nf2#"] },
  { fen: "2k4r/pp3p2/1np3q1/2Q3p1/3R4/1P2P1P1/P4PB1/6K1 w - - 0 1", solution: ["Bh3+"] },
  { fen: "r1b2rk1/p1q2n1p/6p1/2Ppp3/8/2Q2NPP/P4PB1/1R3RK1 w - - 0 1", solution: ["Nxe5","Nxe5","Bxd5+"] },
  { fen: "1r6/RP5p/P1kp4/2n2p2/8/4PKP1/5P1P/8 w - - 0 1", solution: ["Ra8","Kc7","a7","Rxb7","Rc8+"] },
  { fen: "r2qk2r/3bb1pp/5p2/1p1Q4/1pNP4/4P3/PB4PP/R4RK1 w kq - 0 1", solution: ["Ne5","Rf8","Nxd7"] }
]

const PALOMITA_5 = [
  { fen: "r3k1r1/p4p1p/3bpBp1/3p1b2/5P2/3BP2P/PP4P1/1K1R3R w - - 0 1", solution: ["e4","Bxe4","Bxe4"] },
  { fen: "4r2k/6b1/8/p2R3p/1pP1p1Nq/8/PP3P1P/3Q3K w - - 0 1", solution: ["Nf6","Qxf6","Qxh5+","Kg8","Qxe8+"] },
  { fen: "2r4k/2q4p/p2bPp2/1p6/6QP/3B4/PPP5/1K4R1 w - - 0 1", solution: ["e7"] },
  { fen: "3n4/2p2pk1/3r2p1/6Np/1P1q3P/4QR2/5PP1/6K1 w - - 0 1", solution: ["Rxf7+","Nxf7","Ne6+","Rxe6","Qxd4+"] },
  { fen: "r1q2rk1/3bpp1p/3p2p1/3P4/Pnn1P3/2N2NP1/1R1Q1PB1/4R1K1 w - - 0 1", solution: ["Qh6","f6","Rxb4"] },
  { fen: "2r2rk1/p4ppp/1p6/2b5/5Pn1/1Q2PR1P/P5P1/R1B1qBK1 b - - 0 1", solution: ["Nxe3","Rxe3","Rfe8"] },
  { fen: "5r1k/2p5/5qp1/1Pb1p2p/4B2P/3P2P1/4QPK1/5R2 w - - 0 1", solution: ["Bxg6","Qxg6","Qxe5+","Kg8","Qxc5"] },
  { fen: "2kB2r1/p3R3/q1p3r1/bp2Qp2/2PP3p/1P4P1/P4P2/5K2 w - - 0 1", solution: ["Rc7+","Kb8","Rxc6+"] },
  { fen: "1r3k2/2p3Rp/2b5/p1Pp2p1/P2B1pq1/2PB2P1/7P/5RK1 w - - 0 1", solution: ["Rxf4+"] },
  { fen: "6k1/5rpp/4Qn2/3p4/1q1P4/1p2P2P/6P1/3B1RK1 w - - 0 1", solution: ["Bh5","g6","Rxf6","Qb7","Bd1","b2","Qe8+","Kg7","Qxf7+"] },
  { fen: "6rk/7p/8/1p3R2/pN6/P1n2B1P/4brPK/4R3 b - - 0 1", solution: ["Bxf3","Rxf3","Rgxg2+","Kh1","Rh2+","Kg1","Ne2+"] },
  { fen: "2r3k1/p2b2pp/1pqr4/2p1R3/4P3/P1Q3PP/1P4BK/3R4 w - - 0 1", solution: ["Re7","Rd4","Rxd4","cxd4","Qxd4"] },
  { fen: "r3r1k1/p2q1pbp/6p1/3Q2B1/8/5P2/PP4PP/R2R2K1 b - - 0 1", solution: ["Re1+","Rxe1","Qxd5"] },
  { fen: "3r2k1/pp4qn/3p1ppQ/2pPp3/4P1N1/1P2P2R/1PP3PP/6K1 w - - 0 1", solution: ["Qxh7+","Qxh7","Nxf6+"] },
  { fen: "4r2k/p4rp1/1pb3qp/3NB3/2P1Q2n/1P1R4/1P4PP/4R1K1 b - - 0 1", solution: ["Rxe5","Qxh4","Rxe1+","Qxe1","Qxd3"] },
  { fen: "2b3k1/r2r1pp1/p3p2p/1pq1P3/4B2Q/2P5/P4PPP/3RR1K1 w - - 0 1", solution: ["Qd8+","Rxd8","Rxd8+","Qf8","Bh7+","Kxh7","Rxf8"] },
  { fen: "2r5/R2b1pk1/3q1bpp/1p1Pp3/4P3/3P3P/1Q1NBPP1/6K1 w - - 0 1", solution: ["Rxd7","Qxd7","Bg4","Qd8","Bxc8","Qxc8","Qxb5"] },
  { fen: "r6k/7p/1Qp2rpq/p3p3/2B1P3/2B2P1n/P5PK/1R6 w - - 0 1", solution: ["Qb8+","Rxb8","Rxb8+","Kg7","Rg8#"] },
  { fen: "6rk/p6n/3p4/2pPb2q/4N3/P2BQPp1/6K1/7R b - - 0 1", solution: ["Qxh1+","Kxh1","g2+","Kg1","Bd4","Qxd4+","cxd4","Nxd6","Ng5"] },
  { fen: "5rk1/p4qp1/2p4p/1p2Pn2/2pP2Q1/2P4P/P2B3K/5R2 b - - 0 1", solution: ["Ne3","Bxe3","Qxf1"] },
  { fen: "1r3qbk/1p2rpp1/p1p2n1p/PnN1NP2/1P2PQ2/3P1B1P/7K/1R4R1 w - - 0 1", solution: ["Ne6","fxe6","Ng6+","Kh7","Nxf8+"] },
  { fen: "4r1k1/2BR3p/8/5Rp1/4n1K1/4P1P1/1P2P2P/5r2 b - - 0 1", solution: ["h5+","Kxh5","Rxf5"] },
  { fen: "4rrk1/p2pB1pp/2p5/2P1R3/3QN3/Pq2n3/1P4PP/2KR4 w - - 0 1", solution: ["Nf6+"] },
  { fen: "1n3q1k/r2r3p/p3Q3/1p6/8/2P3R1/P4PPP/4R1K1 w - - 0 1", solution: ["Qf6+","Qxf6","Re8+","Qf8","Rxf8#"] },
  { fen: "1qr1r1k1/2b2ppp/Bpb1p3/4n3/P7/2N1BP2/1PP3PP/3RR1QK b - - 0 1", solution: ["Nxf3","gxf3","Bxf3+"] },
  { fen: "2rb2k1/5pp1/2p1pn1p/2P5/1N1Pp3/4P1BP/5PP1/1R4K1 w - - 0 1", solution: ["Nxc6","Rxc6","Rb8","Kh7","Rxd8"] },
  { fen: "5r1k/q3bQpp/2B5/1P2p3/4P3/p1P5/5PPP/5RK1 w - - 0 1", solution: ["b6"] },
  { fen: "2r3k1/4bpp1/4pn1p/1p6/q1r5/2BR1BP1/PQ2PPKP/3R4 b - - 0 1", solution: ["Rxc3"] },
  { fen: "4r1k1/5p2/p5pp/P1p2q2/3Nr3/3Q4/5PPP/1RR3K1 b - - 0 1", solution: ["Re1+","Rxe1","Rxe1+","Rxe1","Qxd3"] },
  { fen: "2r3k1/5p2/p3bBp1/1p5p/4P3/1P4qP/P5P1/1B1RR2K b - - 0 1", solution: ["Bxh3","gxh3","Qxh3+","Kg1","Qg3+","Kh1","Qf3+","Kg1","Qxf6"] },
  { fen: "1r5k/6pp/2p1r3/1R1p4/pn1P1q2/3Q1P2/PP3BPP/3R2K1 w - - 0 1", solution: ["Qf5"] },
  { fen: "r2r2k1/1bqp1ppp/ppnbpn2/8/2PNP3/P1N1BP2/1P2B1PP/2RQ1R1K w - - 0 1", solution: ["Ndb5"] },
  { fen: "2k1r3/p1pbbpp1/1p5p/2pNP3/2P3P1/1P3PBP/P5K1/3R4 w - - 0 1", solution: ["Nxc7","Kxc7","e6+"] },
  { fen: "4r1qk/2p4n/1b3pQB/p1p5/2P1P3/1P1R3P/P5P1/6K1 w - - 0 1", solution: ["Bg7+","Qxg7","Qxe8+"] },
  { fen: "2R5/4bppk/1p1p4/5R1P/4PQ2/5P2/r4q1P/7K w - - 0 1", solution: ["Qh6+"] }
]

const PALOMITA_6 = [
  { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", solution: ["Z0"] },
  { fen: "2k3rr/ppp1npb1/2Pp4/P7/1PBP4/2P2QBq/7P/R4RK1 b - - 0 1", solution: ["Bxd4+","Kh1","Rxg3"] },
  { fen: "r5r1/pp2kpBQ/3pn3/6q1/8/8/P4PPP/3RR1K1 w - - 0 1", solution: ["Rxe6+","Kxe6","Qe4+","Kd7","Qxb7+","Ke6","Re1+","Kf5","Qxf7+","Kg4","Qf3+","Kh4","Qh3#"] },
  { fen: "8/2R3pk/2N2r1p/1p3p2/1Pb1p2P/8/1r3PP1/R5K1 b - - 0 1", solution: ["e3","f3","Rg6","g4","fxg4","f4","Bd5","Nd4","Ra6","Rxa6","Rb1+"] },
  { fen: "2kr3r/ppp2p1p/2Bb1p2/3P4/6b1/5N2/PPP3PP/RNqQK2R b KQ - 0 1", solution: ["Rde8+","Bxe8","Rxe8+","Kf2","Qe3+","Kf1","Bxf3","gxf3","Bc5"] },
  { fen: "r1b1kb1r/ppp2ppp/2n1p3/6B1/3P2q1/3B1N2/PPP2PPP/R2QK2R w KQkq - 0 1", solution: ["h3","Qxg2","Rh2","Qxh2","Nxh2","Nxd4","Bb5+"] },
  { fen: "3r2r1/pbq1kp2/1n2pn1p/2b3p1/B1PN4/4B2P/P2QNPP1/R2R2K1 w - - 0 1", solution: ["Nc6+","Qxc6","Bxc6","Bxe3","Qb4+"] },
  { fen: "r1q1k2r/ppp2p2/1n3Ppp/3pN3/3Pn1Q1/B1P5/P1P3PP/R4RK1 w kq - 0 1", solution: ["Qxg6","fxg6","f7+","Kd8","f8=Q+","Rxf8","Rxf8#"] },
  { fen: "3k4/1b1nb2R/2p5/1p1Ppr2/p7/P1NP1N2/BPP3K1/8 w - - 0 1", solution: ["d6","Bxd6","Be6"] },
  { fen: "1rbk1bnr/ppNpppp1/7p/1N6/4P3/3q4/P2B1PPP/1R1QK2R w K - 0 1", solution: ["Ne6+","Ke8","Nbc7#"] },
  { fen: "5rnr/pp2kpp1/1b1p3p/nBpP2N1/4PN2/8/P4PPP/4RRK1 w - - 0 1", solution: ["Nge6","fxe6","Ng6+","Kf7","Nxh8+","Kf6","f4","Ne7","e5+","Kf5","Bd3+"] },
  { fen: "r1b1k1nr/pp3ppp/2n5/1N6/8/8/qPPQ1PPP/2KR1B1R w kq - 0 1", solution: ["Nc7+","Kf8","Qd6+","Nge7","Qd8+","Nxd8","Rxd8#"] },
  { fen: "3r2k1/1p4pp/1qp2p2/p7/3nN3/P3Q3/1P3PPP/3R2K1 w - - 0 1", solution: ["Nd6","c5","Rxd4"] },
  { fen: "r1b3n1/ppp2qb1/2kp4/5PB1/3P2PQ/2PB4/PP3K2/4R3 w - - 0 1", solution: ["d5+","Kb6","Be3+","c5","Qd8+","Qc7","Qxg8"] },
  { fen: "r3kbnr/p1pp1p1p/1pn5/1P4pq/3PPp2/5N2/1PP2KPP/R1BQ1B1R b kq - 0 1", solution: ["Nxd4","Bxf4","gxf4","Nxd4","Qh4+","Kg1","Bc5"] },
  { fen: "r2nrbk1/ppp2pp1/6np/1P1B4/3P2N1/2P5/1P4PP/R1B2RK1 w - - 0 1", solution: ["Bxh6","gxh6","Nf6+","Kh8","Nxe8"] },
  { fen: "3b1rk1/1bq3pp/5pn1/1p2rN2/2p1p3/2P1B2Q/1PB2PPP/R2R2K1 w - - 0 1", solution: ["Rd7","Qxd7","Nh6+","gxh6","Qxd7"] },
  { fen: "6k1/pbB2ppp/4r3/1P6/3P4/5p1q/P1NQ3P/4R1K1 b - - 0 1", solution: ["Rg6+","Bg3","Rxg3+","hxg3","f2+","Kxf2","Qg2+","Ke3","Qf3#"] },
  { fen: "r2qkb1r/2p2pp1/p1npb2p/1p6/2P1P3/1BQ1B3/PP3PPP/RN2K2R b KQkq - 0 1", solution: ["d5"] },
  { fen: "5r1k/ppp2pbp/4r3/8/2P3QP/1qPR2B1/1P3RP1/2K5 w - - 0 1", solution: ["Rxf7","Rxf7","Qxe6","Rf1+","Be1","Qb6","Qxb6","axb6","Kd2","Kg8","Rd8+","Bf8","Rd7","Bd6","Ke2","Rg1","Kf2","Rh1","Ke2","Rg1"] },
  { fen: "3r4/pp4pk/4R2p/5p2/3Pbq2/2Q5/P2R1PPP/1r1N2K1 b - - 0 1", solution: ["Rc8","Rxe4","Qxe4"] },
  { fen: "Q1bk1q1r/1pbp1ppp/2p1n3/4pN2/4P1B1/2P5/P4PPP/R2R2K1 w - - 0 1", solution: ["Rxd7+","Kxd7","Rd1+","Nd4","cxd4"] },
  { fen: "r3k1nr/pppq1ppp/2n5/1Bb1p3/4P1b1/2NP1N2/PPP3PP/R1BQK2R w KQkq - 0 1", solution: ["Nxe5","Bxd1","Nxd7","Kxd7","Kxd1"] },
  { fen: "4rr1k/1ppb3p/2q1n1p1/p7/3b4/1BP1B3/PP3PP1/2KR1Q1R w - - 0 1", solution: ["Rxd4","Nxd4","Rxh7+","Kxh7","Qh1+","Kg7","Bh6+","Kf6","Qh4+","Ke5","Qxd4+"] },
  { fen: "r2qb1k1/p1pr2bp/1pn2pN1/3NpPpQ/4P3/B7/PPP3PP/R4R1K b - - 0 1", solution: ["Rxd5","exd5","Nd4","Ne7+","Qxe7"] },
  { fen: "3B2k1/6pp/p1p1q3/1pb5/4np2/1PPQ3P/P4PP1/3N2K1 b - - 0 1", solution: ["Nxf2","Nxf2","Qe1+","Kh2","Bxf2","h4","h5"] },
  { fen: "r1b2rk1/ppp3pp/3b3q/2pP4/2P3B1/2B3P1/PP3P2/2RQ1RK1 b - - 0 1", solution: ["Bxg3","fxg3","Rxf1+","Qxf1","Bxg4","Qf4","Qxf4","gxf4"] },
  { fen: "r3k2r/1p2bp1p/p1q1bp2/1Npp3Q/8/1P6/1PP2PPP/R1B1R1K1 w kq - 0 1", solution: ["Rxe6","Qxb5","Bh6","Kd8","Qxf7","Re8","Rae1","Qd7","Bg7"] },
  { fen: "r2q1rk1/ppp2pp1/2n1b2p/3n4/2BP4/2P2N2/P1Q2PPP/R1B1R1K1 w - - 0 1", solution: ["Bxh6","gxh6","Rxe6","fxe6","Qg6+","Kh8","Qxh6+","Kg8","Qxe6+"] },
  { fen: "r1b3k1/ppp2pb1/6p1/8/3P2pQ/2PBq1N1/PP4P1/1K5R w - - 0 1", solution: ["Qd8+","Bf8","Rh8+","Kxh8","Qxf8+","Kh7","Qxf7+","Kh8","Bxg6"] },
  { fen: "1rrb1n2/3kn1p1/2pp4/1p4BP/3PN1p1/1N6/1P2RP2/4R1K1 w - - 0 1", solution: ["Nec5+","dxc5","Nxc5+","Kd6","Bf4+","Kd5","Re5+","Kc4","Rc1+","Kxd4","Nb3+","Kd3","Rc3#"] },
  { fen: "1r5k/3q2pp/p1b2pn1/P3p3/1BBr4/2Q3P1/1P2RPP1/4R1K1 b - - 0 1", solution: ["Bxg2","Kxg2","Qc6+","Re4","Rxe4","Rxe4","Qxe4+","Kg1"] },
  { fen: "6r1/p1k3r1/2p4n/5p1p/2P1B2P/1P3RP1/P5K1/4R3 w - - 0 1", solution: ["Bxc6","f4","Rxf4","Rxg3+","Kf2","Rh3","Bd5"] },
  { fen: "3rrb1k/1p1b1pp1/2pp2p1/pq5N/1P2P3/P4PQ1/1BP3PP/3RR2K w - - 0 1", solution: ["Nf6","gxf6","Qh4+","Kg8","Bxf6"] },
  { fen: "r2qkb1r/2p2p1p/p2p4/1p2p1p1/3nP1b1/1BNP1N2/PPP2P1K/R1BQ1R2 w kq - 0 1", solution: ["Nxe5","Bxd1","Bxf7+","Ke7","Nd5#"] },
  { fen: "r2r2k1/2p2pp1/6q1/1pp5/5P2/N1Pb1Q2/PP4PP/3RR1K1 w - - 0 1", solution: ["Rxd3","Qxd3","Re8+"] },
  { fen: "5r1k/8/2b1pq1p/1p3pNQ/p1pPpP2/P1P1P2P/1P6/6RK w - - 0 1", solution: ["Nxe6","Be8","Rg6","Qxg6","Qxg6","Bxg6","Nxf8"] },
  { fen: "r1bq2k1/ppp1b2p/3pp1p1/8/3P1r2/2PB1N2/PPQ2PPP/4RRK1 w - - 0 1", solution: ["Bxg6","hxg6","Qxg6+","Kh8","Qh6+","Kg8","Qxf4"] },
  { fen: "6k1/5pp1/1bQp3p/1p2qP2/1Pp5/2r5/5PPP/1B3RK1 b - - 0 1", solution: ["Bxf2+","Kh1"] },
  { fen: "2rqk2r/pp1bppb1/2np2p1/7n/3NPP2/2N1B3/PPPQB2P/2KR3R b k - 0 1", solution: ["Nxf4","Bxf4","Nxd4"] },
  { fen: "r1b1k2r/1p2qppp/p4n2/3Pp3/4P3/P2B4/2P3PP/R1BQK2R b KQkq - 0 1", solution: ["Nxe4","Bxe4","Qh4+","Kf1","Qxe4"] },
  { fen: "2krr3/1pp1qpp1/p1pb2np/8/3NP3/4B1PP/bPPNQP2/2KR3R w - - 0 1", solution: ["Nxc6","bxc6","Qxa6+","Kd7","Qxa2","Ra8","Qb1"] },
  { fen: "2k1r2r/1pp2ppp/p2p2q1/8/1PPbP3/N4n2/P1QBRPPP/1R5K b - - 0 1", solution: ["Nxh2","Kxh2","Qh5+","Kg1","Qxe2"] },
  { fen: "8/pp4pk/4Qb1p/3p4/2qP4/K7/P2R2PP/3R4 b - - 0 1", solution: ["Qc3+","Ka4","b5+","Kxb5","Qc4+","Ka5","Bd8+","Qb6","Bxb6#"] },
  { fen: "1r2r1k1/pb3ppp/7P/q1p1RN2/1nQ3P1/7B/1P6/1K3R2 w - - 0 1", solution: ["Qxf7+","Kxf7","Ne7+","Bf3","Rxf3#"] },
  { fen: "r1bqk1nr/pp1p1pp1/2n4p/2b1p3/2B1P3/5N2/PPP2PPP/RNBQK2R w KQkq - 0 1", solution: ["Bxf7+","Kxf7","Qd5+","Ke8","Qxc5"] },
  { fen: "2r1k2r/5p2/3pb3/pPnNp1q1/P3Pbn1/5PB1/2B3P1/1R1QRNK1 b k - 0 1", solution: ["Rh1+","Kxh1","Bxg3","Nxg3","Nf2+","Kg1","Nxd1"] },
  { fen: "2r1k2r/1p3p2/1n1p1p1b/p1pPqN2/4P1Q1/1P1P2P1/P5B1/2R2RK1 w k - 0 1", solution: ["d4","cxd4","Rxc8+","Nxc8","Nxh6"] },
  { fen: "6b1/1p4k1/p2p1p2/3P4/PP1K4/8/4B3/8 w - - 0 1", solution: ["Bxa6","bxa6","b5","axb5","axb5"] },
  { fen: "r3k2r/1ppq1pbp/p1N1bnp1/3pQ3/B2P1P2/8/PPP3PP/RNB1K2R w KQkq - 0 1", solution: ["f5","gxf5","Bh6","O-O","Qg3","Ne8","Ne7+","Qxe7","Bxe8","f6"] },
  { fen: "3k3r/1pp2p2/p1q1bN1p/4P3/2P4n/1P1r1pP1/PQ5P/R1B2RK1 b - - 0 1", solution: ["f2+","Rxf2","Qh1+","Kxh1","Rd1+"] }
]

const PALOMITA_7 = [
  { fen: "1k4rr/ppp2p2/5q2/4p3/1PPpPn2/P2P1Q2/R5NP/5R1K b - - 0 1", solution: ["Rxh2+","Kxh2","Qh6+","Kg1","Nh3+","Kh2","Ng5+"] },
  { fen: "5k2/1p4pP/p7/1p1p2K1/2r5/8/6PP/8 b - - 0 1", solution: ["Rh4","Kxh4","g5+","Kxg5","Kg7"] },
  { fen: "r1b1kb1r/pp2q2p/2p2p2/1B2p3/3PQ3/8/PPP3PP/R1B1K2R w KQkq - 0 1", solution: ["Be2","exd4","Qxd4","Qb4+","Qxb4","Bxb4+","c3"] },
  { fen: "6k1/6p1/3p2rp/pp5r/4Pp2/1PP2PqP/1BP1R1P1/3Q3K b - - 0 1", solution: ["Rxh3+","gxh3","Qxf3+","Kh2","Qg3+","Kh1","f3"] },
  { fen: "rk5r/2p5/p2pP1qp/1p1QnNB1/4P2P/8/PPP3P1/R5K1 w - - 0 1", solution: ["Nxd6","cxd6","Qxd6+","Kb7","Qd5+"] },
  { fen: "2k5/5ppp/1PpPb3/2P5/2BP4/p7/5KPP/8 w - - 0 1", solution: ["d5","cxd5","Ba6+","Kb8","c6"] },
  { fen: "3r1k1r/2N1bppp/8/8/2B1Pp2/8/1Pn3PP/3R1RK1 w - - 0 1", solution: ["Ne6+","fxe6","Rxf4+","Kg8","Bxe6#"] },
  { fen: "4r1k1/3b1pp1/p1rp2qp/1p6/7R/P4N2/1PPQ1PP1/1K1R4 b - - 0 1", solution: ["Rxc2","Qxd6","Rc1+","Kxc1","Rc8+"] },
  { fen: "3r1qk1/5ppp/1p1P4/nPn2N2/R3Q3/7P/5PP1/4R1K1 w - - 0 1", solution: ["Ne7+","Kh8","Qxh7+","Kxh7","Rh4#"] },
  { fen: "2nr2k1/p5pp/2Q5/5b2/8/8/Pq3PPP/R3R1K1 w - - 0 1", solution: ["Rad1","Rf8","Qd5+","Kh8","Qxf5"] },
  { fen: "7k/p1p3pp/1bB2q2/8/2Q2nb1/1PP5/P5PP/R6K b - - 0 1", solution: ["Nh3","gxh3","Bf3+","Bxf3","Qxf3#"] },
  { fen: "3rr1k1/p1pqbppp/2pp4/8/4P1n1/1P4N1/PBP2PPP/R2QR1K1 w - - 0 1", solution: ["Bxg7","Nxf2","Qd4"] },
  { fen: "2kr4/pp3ppp/2b5/6q1/3P4/4r3/PP3PPP/2RQ1RK1 w - - 0 1", solution: ["Rxc6+","bxc6","Qc1","Rxd4","fxe3","Rd6","Rxf7"] },
  { fen: "1r2k3/2p2ppp/3pn3/3R4/P3PP2/4R3/Pr2NP1P/6K1 b - - 0 1", solution: ["Rxe2","Rxe2","Rb1+","Kg2","Nxf4+","Kf3","Nxe2","Kxe2","Rb4","Kf3","Rxa4","e5","dxe5","Rxe5+","Kd7","Re2","c5"] },
  { fen: "r4nk1/1b2qrp1/2n4R/3pP3/2pP4/4B3/P5RP/1B1Q1N1K b - - 0 1", solution: ["Nxe5","dxe5","d4"] },
  { fen: "r2qr1k1/pb1nbppp/4p3/2p5/2P5/2NBB3/PP2QPPP/3R1RK1 w - - 0 1", solution: ["Bxh7+","Kxh7","Qd3+","Kg8","Qxd7"] },
  { fen: "r1bq1r2/ppp1npk1/1b4pp/3P4/2Q1N1P1/P3BN1P/1P3P2/R4RK1 w - - 0 1", solution: ["Qc3+","f6","Nxf6","Rxf6","Bxh6+","Kxh6","Qxf6","Bd7","Qf7","Qg8","g5+"] },
  { fen: "8/1pK1Pk1p/6pP/P5P1/4b3/B7/8/8 w - - 0 1", solution: ["a6","bxa6","Kd7"] },
  { fen: "r3k1nr/pppq1ppp/8/1Nb1P3/2Bp1P2/3P4/PPP4P/R2Q1RK1 w kq - 0 1", solution: ["e6","fxe6","Qh5+","g6","Qxc5","O-O-O","Bxe6"] },
  { fen: "1r4k1/p1b2bpn/2pq1p2/3p1P1p/3P2P1/3B1N1P/P4PN1/2Q1R1K1 b - - 0 1", solution: ["Ng5","Nxg5","Qh2+","Kf1","fxg5"] },
  { fen: "r3k2r/1pqbbp2/p1npp1p1/5P1n/3NP2p/2N2B2/PPP1Q1PP/3R1RBK b kq - 0 1", solution: ["Ng3+","hxg3","hxg3+","Bh2","Rxh2+","Kg1"] },
  { fen: "6k1/2pb1rb1/2pp1p1p/1q3Pp1/2N1P3/1PP3B1/r5PP/3QRR1K w - - 0 1", solution: ["Bxd6","cxd6","Nxd6"] },
  { fen: "1rb3kr/pppp1qp1/4pQ2/3nP2p/7P/2PB2R1/P4PP1/R1B1K3 w Q - 0 1", solution: ["Qd8+","Qf8","Rxg7+","Kxg7","Qg5+","Kf7","Qg6+","Ke7","Bg5+","Nf6","Bxf6+","Qxf6","Qxf6+","Ke8","Bg6#"] },
  { fen: "4rq1k/pp1b1rp1/3p1bQp/2pP1P2/3p4/3B3R/P1PB2PP/4R1K1 w - - 0 1", solution: ["Re6"] },
  { fen: "r1b2r1k/ppp4p/3p1p1q/2b1n1p1/4P3/P2N2BP/1P2QPP1/R2B1R1K b - - 0 1", solution: ["Bxh3","gxh3","Qxh3+","Kg1","Qxg3+"] },
  { fen: "8/6p1/4K3/5P2/4k3/8/7P/8 w - - 0 1", solution: ["h4","Kf4","h5","Kg5","Kf7"] },
  { fen: "kr2r3/pRp3pp/Q1P5/5R2/Pp1q4/3pp2P/6PK/8 w - - 0 1", solution: ["Rxa7+","Qxa7","Ra5","Qxa6","Rxa6#"] },
  { fen: "2k3r1/ppp1qp2/4bQ2/8/3P2r1/N1P5/PP3RP1/R1B3K1 b - - 0 1", solution: ["Rxg2+","Kf1","Bc4+","Nxc4","Rg1#"] },
  { fen: "r2q1rk1/ppp2ppp/5n2/2b1P1B1/Q3P1b1/2P5/PP4PP/RN2KB1R b KQ - 0 1", solution: ["Nxe4","Bxd8","Bf2#"] },
  { fen: "7k/5pp1/8/8/p6P/P1b1N1P1/3p1PK1/3Rr3 b - - 0 1", solution: ["Bb4","axb4","Rxd1","Nxd1","a3"] },
  { fen: "2k3nr/ppp2Npp/2p5/2b5/8/2Pr4/PP1P2PP/RNB4K b - - 0 1", solution: ["Rd7","Nxh8","Re7","g3","Re1+","Kg2","Rxc1","d4","Bd6","Nf7","h6","Nxd6+","cxd6","Kf2"] },
  { fen: "r2qk2r/ppp1nppp/3p4/b2Nn3/2B1P1b1/5N2/PPP2PPP/R1BQ1RK1 w kq - 0 1", solution: ["Nxe5","Bxd1","Nf6+","Kf8","Ned7+","Qxd7","Nxd7+","Ke8","Rxd1","Kxd7","Bxf7"] },
  { fen: "r1b3r1/pp1k3q/2n2pN1/3p1N2/3P4/5Q2/5PPP/5RK1 w - - 0 1", solution: ["Qxd5+","Kc7","Qd6+","Kb6","Rb1+","Ka6","Qa3+","Na5","Qd3+"] },
  { fen: "1k5r/1p1Qnp2/p3p3/2b5/4pq2/P7/1PPNBPP1/1K1R4 w - - 0 1", solution: ["Nxe4","Qxe4","Bf3"] },
  { fen: "5rk1/pb1p2p1/1p1pp2p/6r1/2PPp2q/P3P1N1/1P2BP2/R3QRK1 b - - 0 1", solution: ["Qh3"] },
  { fen: "r2qrnk1/1b2bppp/pp6/2ppN1B1/3PnP2/2PB1N1Q/PP4PP/4RRK1 w - - 0 1", solution: ["Nxf7","Kxf7","Rxe4","dxe4","Bc4+","Bd5","Qf5+","Kg8","Bxd5+","Kh8","Ne5"] },
  { fen: "2r3rk/3q1p1p/5p2/1p1p1b2/2pN3R/P1P1R3/1P3PPP/3Q2K1 w - - 0 1", solution: ["Re7","Qxe7","Nxf5"] },
  { fen: "4r1k1/ppp2ppp/2b5/2b2P2/3r4/3B3P/PPPB2P1/R2R3K b - - 0 1", solution: ["Rxd3","cxd3","Re2","d4","Bxg2+","Kh2","Bc6+","Kg1","Bxd4+","Kf1","Bb5","Bc3","Rxb2+"] },
  { fen: "7k/ppq1b1pp/8/2P5/1P2R1Q1/2P5/P4rPp/2B4K w - - 0 1", solution: ["Bf4","Qd8","Rxe7","Qf8","Qxg7+"] },
  { fen: "r4r1k/ppp2Bpp/5q2/4NQ2/8/8/PP3PPP/n4RK1 w - - 0 1", solution: ["Ng6+","Qxg6","Bxg6","Rxf5","Bxf5","g6","Be4"] },
  { fen: "4r3/pp3kpR/1qpp1rp1/8/2P1P3/2P4Q/P1P3PP/1R5K w - - 0 1", solution: ["Qd7+","Re7","Rxg7+","Kxg7","Qxe7+","Kh6","Rg1"] },
  { fen: "r2qk2r/pp3ppp/1npbp1b1/8/3P1Pn1/1B2B1N1/PPPQN1PP/R4RK1 b kq - 0 1", solution: ["Bxc2","Bxc2","Nc4"] },
  { fen: "rn2r1k1/pp3ppp/5n2/q2p4/1bpP4/2N1BP1P/PPPQBP2/2K3RR w - - 0 1", solution: ["Rxg7+","Kxg7","Bh6+","Kh8","Qg5","Nh5","Rg1"] },
  { fen: "r1bqr1k1/pp1nbppp/2pp1n2/4p1B1/3PP3/2PQ1N2/PP2BPPP/R3KN1R b KQ - 0 1", solution: ["exd4","cxd4","Nxe4"] },
  { fen: "r3k3/pppq1pp1/4p1b1/bN2N2r/1n1P3P/8/P2BQPB1/R3K2R b KQq - 0 1", solution: ["Rxe5","dxe5","Bd3"] },
  { fen: "5rk1/2pqb2p/4p1p1/3p3Q/1Pn5/2P5/2B2PPP/2B1R1K1 w - - 0 1", solution: ["Bxg6","hxg6","Qxg6+","Kh8","Rxe6"] },
  { fen: "3r4/1p6/2p4p/4pk2/Pp5r/1P1P1K2/1P1R3P/6R1 b - - 0 1", solution: ["Rxd3+","Rxd3","e4+","Ke3","Rh3+","Rg3","Rxg3+","hxg3","exd3","Kxd3","Kg4","Kc4","Kxg3","Kc5","h5","Kb6","h4","Kxb7","h3","a5","h2","a6","h1=Q","a7","c5+","Kb8","Qh8+","Kb7"] },
  { fen: "5rk1/1q2bp1p/3pP1p1/1p1P4/nP1p4/3B1QNP/5PP1/R5K1 w - - 0 1", solution: ["Nf5","fxe6","dxe6","Qc7","Qc6"] },
  { fen: "5k2/5pp1/pP1p3p/3b4/r7/4BP2/6PP/2R3K1 w - - 0 1", solution: ["Rc8+","Ke7","b7","Bxb7","Rc7+","Ke6","Rxb7"] },
  { fen: "r4rk1/2pq2pp/pbn1b3/1p1p2B1/4n3/1NPQ1N2/PPB2PPP/3R1RK1 b - - 0 1", solution: ["Rxf3","gxf3","Nxg5"] }
]

const PALOMITA_8 = [
  { fen: "rnbq1n1r/pp3QpB/2pkpb2/3pN3/3P4/2N5/PPP3PP/R4RK1 w - - 0 1", solution: ["Nc4+","dxc4","Ne4+","Kd5","Rf5+","Kxe4","Re1+","Kxd4","c3+","Kd3","Rd5#"] },
  { fen: "rq1n2k1/6b1/p5R1/1p1pP2r/2pP1P2/2P4P/P1QB3K/1R6 w - - 0 1", solution: ["Rxg7+","Kxg7","Rg1+","Kf8","Qg6"] },
  { fen: "8/2NPk3/p5pp/P7/1P3p2/3b3P/6P1/6K1 w - - 0 1", solution: ["Ne6","Kxd7","Nc5+","Kc6","Nxd3"] },
  { fen: "Qnk5/p2q2pp/3p4/p1pB4/2P5/K1P1r3/4r2P/1R2B3 b - - 0 1", solution: ["Ra2+","Kxa2","Qa4+","Kb2","Re2+","Kc1","Qc2#"] },
  { fen: "6r1/p1bR3p/4pkr1/5q2/B1p5/5Q2/1P3PP1/4R1K1 w - - 0 1", solution: ["Rxe6+","Kxe6","Qc6+","Ke5","Rd5+"] },
  { fen: "6k1/p1p1qp2/1rp1r1pp/2Rp2b1/3P4/1PN1P1QP/P4PP1/2R3K1 b - - 0 1", solution: ["Rxe3","fxe3","Bxe3+","Kh1","Bxc1","Nxd5","cxd5","Rxc1"] },
  { fen: "1k1r4/1p5p/5p2/4n1p1/3q4/8/3r1PPP/R1QB1RK1 b - - 0 1", solution: ["Rxf2","Rxf2","Nd3","Qd2","Qxa1","Re2","Qd4+"] },
  { fen: "r1b1r1k1/p1q2pp1/2pb3p/n7/2PP2n1/2NQ1N2/PP2B1PP/R1B1K2R b KQ - 0 1", solution: ["Bg3+","hxg3","Qxg3+","Kd2","Nf2"] },
  { fen: "5rk1/ppq2ppp/2p5/4bN2/4P3/6Q1/PPP2PPP/3R2K1 w - - 0 1", solution: ["Nh6+","Kh8","Qxe5","Qxe5","Nxf7+"] },
  { fen: "1k5r/pp2b3/2p2p1N/qr3p1P/2nP4/PRN5/1PP5/1KQ4R b - - 0 1", solution: ["Nxa3+","Rxa3","Rxb2+","Qxb2","Bxa3","Qb3","Rxh6","Qg8+","Kc7","Qg7+","Kb6","Qxh6","Qb4+","Ka2","Qb2#"] },
  { fen: "2b1r1k1/p1p2pp1/2pp4/2n1qPB1/4P3/1PN2Q2/P5RP/6K1 b - - 0 1", solution: ["Bxf5","Qxf5","Qxc3"] },
  { fen: "5r1k/p2q2p1/2n5/3r3p/1bQ2B2/1P3P2/P3R1PP/4RN1K w - - 0 1", solution: ["Re8","Rd4","Rxf8+","Bxf8","Qe6"] },
  { fen: "3rrbk1/pp1q1ppp/2pp2n1/5N2/3QnP2/1PN5/PBP3PP/3R1RK1 w - - 0 1", solution: ["Nh6+","gxh6","Nxe4","Rxe4","Qxe4"] },
  { fen: "r2qr1k1/pbpnbppp/1p2pn2/6N1/3P4/3B1N2/PPP1QPPP/R1B1R1K1 w - - 0 1", solution: ["Nxf7","Bxf3","gxf3","Kxf7","Qxe6+","Kf8","Bc4"] },
  { fen: "q5k1/2p2ppp/rr6/3p4/1p1P3P/1Q2PP2/PP1B1P2/K3R3 b - - 0 1", solution: ["Rxa2+","Qxa2","Ra6","Qxa6","Qxa6+","Kb1","Qd3+"] },
  { fen: "r2qr1k1/pp1nbpp1/2p1pn1p/6N1/3P1P2/2PB4/PP1BQ1PP/4RRK1 w - - 0 1", solution: ["Nxf7","Kxf7","Qxe6+","Kf8","Bg6"] },
  { fen: "2kr4/ppnq1p2/5r1p/N1pbp2P/P3NB2/1PPP1Q2/2K1B3/3R4 w - - 0 1", solution: ["Nxf6","Bxf3","Bxf3","Qd6","Bxe5","Qb6","Nxb7","c4","d4","Qxb3+","Kd2","Qb2+","Ke3","Qxc3+","Kf2"] },
  { fen: "2kr3r/1pp1b3/p1n1b3/4pp2/6p1/P1NPB1P1/1PPNKP2/R6R b - - 0 1", solution: ["f4","Rxh8","Rxh8","gxf4","exf4","Bxf4","Nd4+"] },
  { fen: "2r3k1/q4ppp/p3p3/pnNp4/2rP4/2P2P2/4R1PP/2R1Q1K1 b - - 0 1", solution: ["Nxd4","cxd4","R8xc5"] },
  { fen: "1k6/pp4p1/2nb1p2/4r3/P7/2PQ4/1P4PP/4rR1K b - - 0 1", solution: ["Rd5","Qf3","Ne5","Qf2","Rxf1+","Qxf1","Ng4"] },
  { fen: "3r3k/pb1p1rp1/1pn2pp1/2qNp1B1/2B1P3/3R4/PPP2PPP/3R2K1 w - - 0 1", solution: ["Rh3+","Kg8","Nxf6+","Kf8","Rh8+","Ke7","Re8+","Rxe8","Rxd7+","Kf8","Rxf7#"] },
  { fen: "2k4r/pppqb3/2n2p2/3bp2p/Q4PrN/P2PB1P1/1P2P1BK/2R2R2 b - - 0 1", solution: ["Rxh4+","gxh4","Bxg2","Kxg2","Qg4+","Kf2","Qxh4+","Kf3","Nd4+","Ke4","f5+","Kd5","Qf6"] },
  { fen: "5r2/6k1/p1r3p1/5PQ1/2q1PN2/1p6/P6P/5R1K w - - 0 1", solution: ["f6+","Rfxf6","Nh5+","Kh7","Nxf6+","Kg7","Nh5+","Kh7","Qe7+","Kh6","Ng3"] },
  { fen: "r1br1qk1/pp1n1p2/2p2npp/4pN2/2BPP3/5N2/PP3PPP/2RQR1K1 w - - 0 1", solution: ["Bxf7+","Kh7","Bxg6+","Kxg6","dxe5"] },
  { fen: "2rr1nk1/pbq2ppp/8/1Bp1P3/4p3/P7/QP1N1PPP/3RR1K1 b - - 0 1", solution: ["Qa5","Nc4","Rxd1","Rxd1","Qxb5","Nd6","Qd7"] },
  { fen: "r1b2rk1/pp1n2pp/4p3/6q1/2NPQn2/3B4/PP4PP/2R2RK1 w - - 0 1", solution: ["Qxh7+","Kf7","Rxf4+","Qxf4","Rf1","Qxf1+","Bxf1"] },
  { fen: "4k3/rp3ppb/1np1p2p/N7/1PP5/6P1/4PPBP/3R2K1 w - - 0 1", solution: ["Nxb7","Rxb7","Bxc6+","Rd7","c5"] },
  { fen: "r2q1r1k/1p2pp1p/p4n2/2pp2Q1/4p3/2NP2P1/PPP2PK1/R6R w - - 0 1", solution: ["Nxd5","Qxd5","Rxh7+","Nxh7","Qxd5"] },
  { fen: "1rbq1r2/4bpk1/p3p1p1/1p2P1P1/2pPBP2/2P5/PP2Q1P1/2KR3R w - - 0 1", solution: ["Rh7+","Kxh7","Qh5+","Kg8","Bxg6","fxg6","Qxg6+","Kh8","Rh1#"] },
  { fen: "3qr1k1/pp3ppp/3b4/8/1nrN3P/P1N1P3/1P1K1PP1/1Q3R1R b - - 0 1", solution: ["Rxd4+","exd4","Bf4+","Kd1","Qxd4+","Qd3","Qxd3#"] },
  { fen: "r2qk2r/2p2p2/p1np3p/1pb1p1pb/4P3/1B1P1NPP/PPP3P1/RN1Q1R1K w - - 0 1", solution: ["Nxe5","Bxd1","Bxf7+","Kf8","Nxc6","Qd7","Be6+"] },
  { fen: "2k1r3/ppp2p1p/8/7q/5Bn1/Q1P3pN/PP4P1/R4K2 b - - 0 1", solution: ["Nf2","Kg1","Nxh3+","gxh3","Qxh3"] },
  { fen: "1rb1q2k/ppp1r2p/4p1p1/4PpN1/P6R/2Q5/5PPP/3R2K1 w - - 0 1", solution: ["Nxh7","Rxh7","Rxh7+","Kxh7","Qxc7+","Kh6","Rd8"] },
  { fen: "r3rnk1/1pqnb3/p3p1p1/3p2P1/7B/2NB4/PPP1Q2P/5RRK w - - 0 1", solution: ["Bxg6","Nxg6","Qxe6+","Kh8","Qxg6","Qc6","Qh5+","Kg8","Qf7+","Kh8","g6","d4+","Nd5"] },
  { fen: "r1b2r1k/ppp3pp/3b4/4Npq1/2B5/8/PPP2PPP/R2QR1K1 w - - 0 1", solution: ["Qxd6","cxd6","Nf7+","Rxf7","Re8+","Rf8","Rxf8#"] },
  { fen: "5r2/2p3k1/1p1p1rBp/p1nPpP2/6q1/2P1R1Pp/P1P4K/4QR2 b - - 0 1", solution: ["Qxg6","fxg6","Rxf1"] },
  { fen: "5r2/p1ppk1r1/1pn1p2p/8/2PP1N2/2P5/P2K2PP/R4R2 w - - 0 1", solution: ["Nd5+","Ke8","Nxc7+","Ke7","Nd5+","Ke8"] },
  { fen: "2kr3r/pppq1p2/3p4/3Nb1p1/2B1P1nP/2P3P1/PP2Q1K1/R4R2 w - - 0 1", solution: ["Rxf7","Qxf7","Nb6+","axb6","Bxf7","Nf6","hxg5"] },
  { fen: "r2q1rk1/pp1nbppp/2pnb3/3p2BN/3P1Q1P/2NB4/PPP2PP1/2KR3R w - - 0 1", solution: ["Bh6","Ne8","Bxg7","Nxg7","Qh6"] },
  { fen: "br1q1rk1/p3p1bp/6p1/1p1n2B1/2pPB3/P1P4P/2Q2PP1/1R1R1NK1 b - - 0 1", solution: ["Nxc3","Bxg6","Qd5","Bxh7+","Kh8","f4","Nxb1","Rxb1","Qxd4+"] },
  { fen: "5k1r/p2p4/bpqP2p1/5p2/2P1rP2/2QR1B2/P4b2/5KR1 b - - 0 1", solution: ["Bd4","Rxd4","Bxc4+","Kf2","Rh2+","Kg3","Rh3+","Kxh3","Bf1+","Rxf1","Qxc3"] },
  { fen: "2r1k2r/p2nbppp/q3pn2/1Np5/PpNP1P2/4P3/1P1BQ1PP/R4RK1 w k - 0 1", solution: ["Ncd6+","Bxd6","Nc7+","Rxc7","Qxa6"] },
  { fen: "4r1k1/1pp2ppp/p1b5/6Q1/5q1P/1BN5/PP1r1PP1/5RKR b - - 0 1", solution: ["Rxf2","Bxf7+","Kh8","Rd1","Qxf7"] },
  { fen: "1kr4r/pb1q2pp/1p6/4bp2/1Q3N1P/3pPP2/PP1N1P2/1KR4R b - - 0 1", solution: ["Rc2","Rxc2","dxc2+","Kxc2","Rc8+","Kb1","a5"] },
  { fen: "2r2r1k/6R1/p2b3p/3P3q/1pPppB2/1P1Q1P1P/P6K/6R1 w - - 0 1", solution: ["Rg8+","Rxg8","Qxd4+","Kh7","Qxe4+","Rg6","Bxd6"] },
  { fen: "6rr/1b1k1p2/p3p2b/1pQpP3/5P1q/3B4/PP4N1/2R1R1K1 b - - 0 1", solution: ["Rxg2+","Kxg2","d4+","Be4","Rg8+","Kf1","Qxf4+","Ke2","Qxe4+","Kd1","Qd3#"] },
  { fen: "r2qr1k1/pb1nb1pp/1p2pn2/2p1Np2/2PP1B2/3B1N2/PP2QPPP/R4RK1 w - - 0 1", solution: ["Nf7","Kxf7","Qxe6+","Kg6","g4","Be4","Nh4#"] },
  { fen: "3rk2r/pbqnbppp/1pp1pn2/4N3/3P4/3B2N1/PPPBQPPP/4RRK1 w k - 0 1", solution: ["Nxf7","Kxf7","Qxe6+","Kf8","Qxe7+"] },
  { fen: "4r1k1/p1p2rp1/2p2n2/5PBq/4p1P1/4Q3/PPP4R/4R1K1 b - - 0 1", solution: ["Qxh2+","Kxh2","Nxg4+","Kg3","Nxe3"] },
  { fen: "5k1r/pp2nppp/2p1b3/4N3/3r1P2/1B2R3/PP4PP/4R1K1 w - - 0 1", solution: ["Nxf7","Kxf7","Rxe6","Nd5","Re7+"] },
  { fen: "r4rk1/p1pp2pp/1p2p3/n6q/Q1PPR3/2P2P2/P2B2PP/5RK1 b - - 0 1", solution: ["Nxc4","Qxc4","d5","Qb5","a6"] }
]

const PALOMITA_9 = [
  { fen: "3r4/4kp2/1RQ4p/p2rP1p1/P7/3q3P/5BP1/6K1 w - - 0 1", solution: ["Qf6+","Ke8","e6","Qf5","exf7+","Kf8","Bc5+","Rxc5","Qxd8+","Kxf7","Rb7+"] },
  { fen: "3r1r1k/1b4p1/pb5p/4Pp1q/2pBnP2/5N1N/PPQ3PP/3R1R1K b - - 0 1", solution: ["Bxd4","Rxd4","Rxd4","Nxd4","Qxh3","gxh3","Nf2+","Kg1","Nxh3#"] },
  { fen: "2r1k3/p4R1Q/1p4Bp/3pP3/6P1/P4K2/1P4P1/2r1q3 b - - 0 1", solution: ["R8c3+","bxc3","Rxc3+","Bd3","Qf1+","Ke3","Rxd3+","Qxd3","Qxd3+","Kxd3","Kxf7"] },
  { fen: "2rq1bk1/3b1ppp/p1p5/3p4/3Nr3/1P2PQ2/PB3PPP/2RR2K1 w - - 0 1", solution: ["Nxc6","Bxc6","Rxc6","Rxc6","Qxe4","dxe4","Rxd8"] },
  { fen: "6k1/3nrppp/2B5/p1b2P2/5Q2/1P5P/Pr6/5R1K w - - 0 1", solution: ["f6","gxf6","Bxd7","Rxd7","Qg4+"] },
  { fen: "3r1r1k/pb4pp/3b4/1Pp2nq1/2Q1p3/1P1pP2P/PB3PPN/R2NR2K b - - 0 1", solution: ["Ng3+","Kg1","Bd5"] },
  { fen: "3q1kr1/3npp1p/1p1Pn1p1/1p6/rP1Q4/P4N2/3N1PPP/R3R1K1 w - - 0 1", solution: ["Rxe6","fxe6","Ng5","Nc5"] },
  { fen: "3qr1k1/p4rpp/1pRbp3/1Q1p4/1P1Bn3/4P1PB/P4P1P/5RK1 w - - 0 1", solution: ["f3","Nd2","Rxd6","Qxd6","Qxe8+"] },
  { fen: "1k1r3r/pp1q2p1/4pp2/1P6/2RP1P2/1Q2P2p/6PP/R5K1 w - - 0 1", solution: ["Rxa7","Qd5","Qa2","Qxg2+","Qxg2","hxg2","b6","Rc8","Rca4"] },
  { fen: "r2qnrk1/2p2ppp/p1QN4/4p3/8/8/PPP2PPP/R1BR2K1 w - - 0 1", solution: ["Bg5","Qxg5","Ne4","Qf4","Qxa8","Nd6"] },
  { fen: "6k1/1Qn3pp/1B2pr2/1q1nNp2/3P4/1P6/5PPP/R5K1 w - - 0 1", solution: ["Ra8+","Nxa8","Qc8+","Rf8","Qxe6+","Kh8","Nf7+","Kg8","Nh6+","Kh8","Qg8+","Rxg8","Nf7#"] },
  { fen: "3r2k1/pp2qppp/2b1p3/3p4/5P2/b2BPR2/1B1N2PP/3Q2K1 w - - 0 1", solution: ["Bxh7+","Kxh7","Rh3+","Kg8","Qh5","f6","Bxa3","Qxa3","Qh8+","Kf7","Qxd8","Qc1+","Nf1"] },
  { fen: "4Q3/3N1pkp/3q2pb/p7/Pp1p2P1/1P6/2r2P1P/3R2K1 b - - 0 1", solution: ["Be3","fxe3","Qxh2+","Kf1","Qh1#"] },
  { fen: "5rk1/1p5p/4p1p1/1P1pn2r/1P1R1P2/6P1/6KP/4RB2 b - - 0 1", solution: ["Rxh2+","Kxh2","Nf3+","Kg2","Nxd4"] },
  { fen: "3rkb1r/pp3p1p/1q4p1/4nN2/4N3/8/PP2QPPP/R4RK1 w k - 0 1", solution: ["Qb5+","Nd7","Rfe1"] },
  { fen: "r3nr1k/pppq1ppp/3p1R2/3Nn1BQ/2B1P3/3P3P/PPP3P1/7K w - - 0 1", solution: ["Rh6","gxh6","Bf6+","Nxf6","Nxf6","Qe7","Qxh6","Qxf6","Qxf6+","Kg8"] },
  { fen: "2k1r2r/pp1n1q2/2pb3p/3pnB1Q/5B2/2N5/PPP3PP/4RRK1 w - - 0 1", solution: ["Rxe5","Qxh5","Bxd7+","Kxd7","Rxh5"] },
  { fen: "5r2/pb2qp1k/1pnr2pp/7Q/4B3/4P1N1/P4PPP/2R2RK1 w - - 0 1", solution: ["Nf5","gxh5","Nxe7+","f5","Bxc6"] },
  { fen: "6k1/p3Qpp1/Pp5p/4P3/4q3/5N1P/5nPK/8 b - - 0 1", solution: ["Qf4+","Kg1","Nxh3+","gxh3","Qg3+","Kh1","Qxf3+"] },
  { fen: "r1b3k1/pp3p1p/1qp3p1/8/3rPP2/PP6/1BQ2PBP/5RK1 w - - 0 1", solution: ["Qc3","c5","b4","f6","bxc5"] },
  { fen: "r1b2rk1/pp4pp/8/3Pqp2/2B1nN2/5R2/PP1Q2PP/R5K1 w - - 0 1", solution: ["d6+","Kh8","Ng6+","hxg6","Rh3#"] },
  { fen: "4n1k1/pbrq2p1/4rB1Q/4P3/4p3/6RP/PP4P1/5RK1 w - - 0 1", solution: ["Bxg7","Nxg7","Rf8+","Kxf8","Qh8+","Ke7","Rxg7#"] },
  { fen: "r5k1/2Bn1ppp/2p1pb2/2Pp4/3P1P2/r1NqP3/3Q2PP/2R1K2R b K - 0 1", solution: ["Nxc5","dxc5","Bxc3"] },
  { fen: "r3r1k1/pppqnppp/2n3b1/3p3N/3P4/2PB2Q1/P1PB1PPP/R3R1K1 w - - 0 1", solution: ["Bh6","Nf5","Bxf5","Rxe1+","Rxe1","Qxf5","Nxg7","Qxc2"] },
  { fen: "4r1k1/Q5pp/p1p2r2/1p1p1PN1/6P1/4n2P/PPP2K2/8 b - - 0 1", solution: ["Nxf5","Nxh7","Rf7"] },
  { fen: "3r2k1/p2r1pp1/1pQ3p1/3P2q1/P7/6P1/5P1P/2R1R1K1 w - - 0 1", solution: ["Qxd7","Rxd7","Re8+","Kh7","Rcc8"] },
  { fen: "3r3r/p1p2kpp/1pn1pp2/1Q1q1n2/2NP4/4PN2/PP3PPP/2RR2K1 w - - 0 1", solution: ["Qxc6","Qxc6","Nce5+","fxe5","Nxe5+","Kf6","Rxc6"] },
  { fen: "r3k2r/p2q1ppp/R3b3/1ppN4/8/1P6/1PP2PPP/3QR1K1 w kq - 0 1", solution: ["Rexe6+","fxe6","Rxe6+","Kf7","Re7+","Qxe7","Nxe7","Kxe7"] },
  { fen: "r1b2r2/pp2nq1k/6pp/2pp4/4BPPN/2P5/P1Q3KP/4RR2 w - - 0 1", solution: ["Bxg6+","Nxg6","Nxg6","Kg8","Nxf8"] },
  { fen: "1r4k1/p4pp1/3p4/6P1/q1p5/2Qn1N2/PP1R1PP1/1K6 b - - 0 1", solution: ["Rxb2+","Qxb2","Nxb2"] },
  { fen: "2q1r1k1/5p1p/1p1P2p1/2p5/PpNbr2P/1P1Q2P1/3R4/5R1K b - - 0 1", solution: ["Re2","Rxe2","Rxe2","Qxe2","Qh3+","Qh2","Qxf1+","Qg1","Qxg1#"] },
  { fen: "r2qkb1r/1b3ppp/pn2p3/4N3/2pP4/2N1B3/PP3PPP/R2Q1RK1 w - - 0 1", solution: ["d5"] },
  { fen: "r1b2r2/p1q1bpk1/1np1pn1p/1p6/3P3P/3B1N2/PPPBQPP1/2KRR3 w - - 0 1", solution: ["Bxh6+","Kg8","Ne5"] },
  { fen: "2r2rk1/1p4p1/pq2pnQp/3p4/4P3/2N4P/PP1R1PP1/3R2K1 b - - 0 1", solution: ["Rxc3","bxc3","Nxe4","Rd4","Rxf2"] },
  { fen: "r4k2/pb3rpp/1p3p2/1Bn1pq2/3R2NP/6Q1/P1P2PP1/3R2K1 w - - 0 1", solution: ["Rd8+","Rxd8","Rxd8+","Ke7","Nh6","gxh6","Qg8"] },
  { fen: "2k1r3/p2nrp2/1pb1q1pp/2p1p2n/2P5/2QNPPB1/PPBR2PP/2KR4 w - - 0 1", solution: ["Nxc5","Nxc5","Rd6"] },
  { fen: "r3r1k1/pp3ppp/1q2pn2/1Nb1n3/2P5/1P1BB3/P4PPP/R2QR1K1 w - - 0 1", solution: ["Bxc5","Qxc5","b4","Qxb4","Rxe5"] },
  { fen: "2r2bk1/1p3pp1/7p/1P1Pp3/B7/P2q4/Q4PPP/4R1K1 b - - 0 1", solution: ["Qe4","Rxe4","Rc1+","Re1","Rxe1#"] },
  { fen: "3r4/1kbQ4/1q2p3/3p4/3P2p1/pP1N4/P6P/1KR5 w - - 0 1", solution: ["Rxc7+","Qxc7","Nc5+","Kb6","Qxc7+","Kxc7","Nxe6+","Kc8","Nxd8","Kxd8"] },
  { fen: "2rq1rk1/p5b1/4p2p/1pN1Pn2/2pP2pp/2P5/PPB4Q/4RRK1 b - - 0 1", solution: ["Nxd4","cxd4","Qxd4+"] },
  { fen: "3r2k1/7p/bq2ppp1/p1R5/Pp2P2P/4QB2/1P3PP1/6K1 w - - 0 1", solution: ["e5","f5","Rc8","Qxe3","Rxd8+","Kf7","fxe3"] },
  { fen: "r3r1k1/pb1q2p1/1p1np1Qp/5p2/1BP2P2/3BR3/P5PP/4R1K1 w - - 0 1", solution: ["Bxd6","Qxd6","Bxf5"] },
  { fen: "2r1k1r1/1b2bp1p/4pn2/p2q4/Pp6/1P1NQPB1/N1P3PP/2R2R1K b - - 0 1", solution: ["Rxg3","hxg3","Ng4","Nf4","Nxe3"] },
  { fen: "r4rk1/p1p2ppp/2Q1pq2/3P4/3Pn1b1/2P1PP2/P5PP/R1B1KB1R b KQ - 0 1", solution: ["Bxf3","gxf3","Qxf3","Rg1","Qf2+","Kd1","Qxg1"] },
  { fen: "1k1r4/1pp1q1n1/p2p4/3BnP1p/4PB1b/2PPQ3/PP1K2bP/R5R1 b - - 0 1", solution: ["Nxf5","exf5","Bxd5"] },
  { fen: "r2br2k/pbqn2p1/1p2Qn1p/2p5/3P1P1N/P1PB4/1P1B2PP/3R1RK1 w - - 0 1", solution: ["Ng6+","Kh7","Ne5+","Kh8","Nf7+","Kg8","Nxh6+","Kh8","Qg8+","Nxg8","Nf7#"] },
  { fen: "2kr3r/ppqnbppp/2p1pnb1/4N3/2BP1PP1/2N4P/PPPBQ3/2KR3R w - - 0 1", solution: ["f5","exf5","Nxg6","fxg6","Qxe7"] },
  { fen: "2rqkb1r/1b1n1pp1/p1p1pn1p/1p2N3/P2P4/3BPN2/1PQB1PPP/R3K2R w KQk - 0 1", solution: ["Bg6","fxg6","Qxg6+","Ke7","Bb4+","c5","dxc5","Nxc5","Qf7+","Kd6","Qxb7"] },
  { fen: "r4rk1/ppp3p1/2bpq3/5pPR/3Qn3/5N2/PPP2PP1/2K4R w - - 0 1", solution: ["Ne5","dxe5","g6","Qxg6","Qc4+","Rf7","Rh8#"] },
  { fen: "6k1/1p3pp1/p3p3/1b4Pp/3P4/5P2/q1r1N2P/2NQK2R b K - 0 1", solution: ["Rxc1","Nxc1","Qg2"] },
  { fen: "6k1/rb4pp/pN6/P3rp2/1pRp4/3B2qP/1P2Q1P1/4R1K1 w - - 0 1", solution: ["Rc8+","Kf7","Qh5+"] }
]

const PALOMITA_10 = [
  { fen: "2k3r1/3r2N1/ppp4p/3bPN2/P1p1n3/6P1/1PP4K/3R1R2 w - - 0 1", solution: ["e6","Rdxg7","Nxg7","Rxg7","Rxd5","cxd5","Rf8+","Kc7","Rf7+","Rxf7","exf7"] },
  { fen: "2kr3r/pp3bpp/1qp5/3n1p2/P1PPpP2/B3P1P1/2Q1BKP1/R6R b - - 0 1", solution: ["Nxe3","Qc3","Ng4+","Bxg4","fxg4"] },
  { fen: "r1r3k1/pp3p2/4pp1p/2q5/b1nN4/3BP3/P3QPPP/1R3RK1 w - - 0 1", solution: ["Nxe6","fxe6","Qg4+","Kh8","Rxb7","Rc7","Rxc7","Qxc7","Bxc4"] },
  { fen: "2k1q3/ppp1r3/3brpp1/n2p1n2/3P1PNp/1PP2Q1P/P2BN1P1/3KRR2 b - - 0 1", solution: ["Nc4","bxc4","Qa4+","Kc1","Ba3+","Kb1","Rb6+"] },
  { fen: "1r3rk1/pbpn2qp/1p1p1np1/3P1p2/1P5N/5PPB/PB5P/2QR1RK1 w - - 0 1", solution: ["Bxf5","gxf5","Nxf5","Qh8","Nh6+","Kg7","Qg5#"] },
  { fen: "6k1/p6p/2p5/6pq/2P2rn1/2B5/PP4Q1/4R1K1 b - - 0 1", solution: ["Nh2","Qxh2","Rg4+","Kh1","Rh4"] },
  { fen: "rnb2rk1/2qpbpp1/p6p/2pPp3/Q3P3/2P1NN2/1P3PPP/3RKB1R w K - 0 1", solution: ["d6","Bxd6","Nf5"] },
  { fen: "Rnk5/1p4pp/1Pp2pq1/2B1r3/1P6/7P/3r2PQ/5RK1 w - - 0 1", solution: ["Rxb8+","Kxb8","Qxe5+"] },
  { fen: "3Rnrk1/6pp/2r5/pR3p2/2q1pP2/Q1P3P1/P3P1BP/7K w - - 0 1", solution: ["Rxf5","Rxf5","Rxe8+","Kf7","Qe7+","Kg6","Bxe4"] },
  { fen: "5rk1/p2q2pp/3p2r1/1ppPp3/2n1P3/P1P2P2/6PP/1QBRR2K b - - 0 1", solution: ["Rxf3","gxf3","Qh3","Rg1","Qxf3+","Rg2","Qxg2#"] },
  { fen: "1n5r/R5pp/2rNpp2/2k5/8/4P3/1P2P1KP/3R4 w - - 0 1", solution: ["b4+","Kxb4","Rb7+","Kc3","Ne4+","Kc2","Rbb1"] },
  { fen: "1r2r1k1/ppp2ppp/8/q1PP3b/5P2/4R1P1/P1Q3BP/1R4K1 w - - 0 1", solution: ["Rxb7"] },
  { fen: "r2qkb1r/1pp1npp1/p1np3p/4p2b/4P3/1BNP1N1P/PPP2PP1/R1BQK2R w KQkq - 0 1", solution: ["Nxe5","Nxe5","Qxh5"] },
  { fen: "5rk1/pp1q2pp/1np5/5pQ1/3P4/1P1N2RP/1P3PP1/6K1 w - - 0 1", solution: ["Nc5","Qf7","Ne6"] },
  { fen: "4r1k1/pp3pp1/2p3p1/5p1q/3P4/2PRNnPP/PP3PQ1/5K2 b - - 0 1", solution: ["f4","gxf4","Qb5","c4","Qxc4"] },
  { fen: "2r5/p3p1kp/q1n2pp1/8/1p6/1P2PP2/PN4PP/Q3K2R b - - 0 1", solution: ["Nd4","exd4","Rc2","Nc4","Rxa2","Qd1","Ra1"] },
  { fen: "5r1k/pb4pp/1pnrp3/1Q3pq1/8/P1N2B2/1P3PPP/R3R1K1 w - - 0 1", solution: ["Ne4","Qg6","Nxd6","Nd4","Bxb7","Nxb5","Nxb5"] },
  { fen: "3r1rk1/2q2p1p/1n5Q/1pp1pp2/8/1BP4P/1P3PP1/R2R2K1 w - - 0 1", solution: ["Bxf7+","Qxf7","Rxd8","Rxd8","Qg5+"] },
  { fen: "r1b3k1/pp2q1pp/1b3p2/3rp3/3N4/4P1P1/PP3P1P/R1BQ1RK1 w - - 0 1", solution: ["Nf5","Bxf5","Qxd5+"] },
  { fen: "2brq1k1/1pRn1r1p/p3p1p1/3nP1P1/4NP2/BP2Q1P1/P2R2B1/6K1 w - - 0 1", solution: ["Rxd5","exd5","Nd6"] },
  { fen: "1r3rk1/p1p3b1/2Pp2Qp/2pP2pP/5q2/2N5/PP1RR1P1/2K5 b - - 0 1", solution: ["Rxb2","Kxb2","Qb4+","Kc1","Qxc3+","Qc2","Qa1+","Qb1","Rf1+"] },
  { fen: "8/6k1/1N2p3/p2b1p2/3P3p/2BK1P2/6P1/6b1 b - - 0 1", solution: ["Bxf3","Be1","Bxg2","Bxh4","e5"] },
  { fen: "Q7/ppp2kpp/8/2b5/4RP1q/7b/PPP3PP/3R3K b - - 0 1", solution: ["Bxg2+","Kxg2","Qg4+","Kf1","Qf3+","Ke1","Qf2#"] },
  { fen: "4r1k1/ppp2qpp/2r5/3N1P2/4p2n/1Q6/PPP3PP/3RR1K1 w - - 0 1", solution: ["Ne7+","Rxe7","Rd8+","Re8","Rxe8#"] },
  { fen: "r5k1/p2b3p/2pb2p1/7R/2P5/1P4P1/PB6/6KB w - - 0 1", solution: ["Bd5+","cxd5","Rxd5","Bf5","Rxd6","Bb1"] },
  { fen: "r4rk1/ppp1qpb1/2n1b2p/3p1p2/3P3N/2N1Q1PB/PPP2P1P/2KR3R b - - 0 1", solution: ["f4","gxf4","Qxh4","f5"] },
  { fen: "r3r3/pp3k2/q3bppB/2pQ4/1b1p2PP/8/1PP1N3/1NKR1R2 w - - 0 1", solution: ["Rxf6+","Kxf6","Rf1+","Bf5","Qd7"] },
  { fen: "7r/pp1br2B/8/2k1Pp2/2p5/7R/PPP3P1/2K4R w - - 0 1", solution: ["Bxf5","Rxh3","Bxh3"] },
  { fen: "4kb1Q/1p3p2/2n1q3/5p2/3prBp1/3R2K1/PP4PP/5R2 b - - 0 1", solution: ["Rxf4","Kxf4","Ne5"] },
  { fen: "2b3k1/2p2rbp/1p1p2p1/p2Pq3/P1PNpr2/1P4PP/2BQRP2/1K1R4 b - - 0 1", solution: ["Rxf2","Rxf2","e3","Re2","exd2","Rxe5"] },
  { fen: "r3rbk1/pbq2ppp/1p3n2/2pPN3/5P2/1P4P1/PB4BP/R2Q1RK1 w - - 0 1", solution: ["d6","Qb8","d7","Rd8","Nc6"] },
  { fen: "2kr3r/pppqp1bp/6p1/n4p2/1P1PpP2/4P2P/P1PN2P1/R1BQ1RK1 b - - 0 1", solution: ["Bxd4","exd4","Qxd4+","Kh1","Qxa1","bxa5","e3"] },
  { fen: "r3kb1r/ppp2ppp/2nqb3/3n2N1/2Bp4/8/PPP2PPP/RNBQR1K1 w kq - 0 1", solution: ["Nxf7","Kxf7","Qf3+","Ke7","Bxd5","Ne5","Qh5","Qxd5","Rxe5","Qc6"] },
  { fen: "2r5/qpBnrkpb/p2Qpp2/3p3p/6nN/1P1P2P1/P3PPBP/2R2RK1 w - - 0 1", solution: ["Bxd5","exd5","Qxd5+","Kf8","Qxh5","Nh6","Bd6"] },
  { fen: "5rk1/ppQ2ppp/6q1/3rP3/3p1R2/P7/1P4PP/5RK1 w - - 0 1", solution: ["Rxf7","Re8"] },
  { fen: "6k1/5pb1/1p1N3p/p5p1/5q2/Q6P/PPr5/3RR2K w - - 0 1", solution: ["Re8+","Bf8","Rxf8+","Kxf8","Nf5+","Kg8","Qf8+","Kxf8","Rd8#"] },
  { fen: "1k6/1p5p/p2b4/3p1p2/P1pP1P1q/2PrB1rP/1P2RQP1/4R2K b - - 0 1", solution: ["Rdxe3","Rxe3","Rxh3+","Rxh3","Qxf2"] },
  { fen: "3r2k1/1p2Qb1p/1q3pp1/pP1p4/P2N3P/2P5/5PP1/4R1K1 w - - 0 1", solution: ["Re6","Bxe6","Nxe6"] },
  { fen: "r3qrk1/2R1b1pp/1p2p3/3b1p2/1P1Nn3/P3B1P1/5PBP/1Q1R2K1 w - - 0 1", solution: ["Nxf5","exf5","Rxd5"] },
  { fen: "5rk1/1Q3pp1/1N1Bp2p/p2p4/3P4/2nqP3/P2b1PPP/5RK1 b - - 0 1", solution: ["Ne2+","Kh1","Ng3+","hxg3","Qxf1+","Kh2","Qxf2","Bxf8","Bxe3","Qb8","Qg1+","Kh3","Qh1+","Kg4","Qd1+","Kh4","g5+","Kh3","Qh5#"] },
  { fen: "3r1rk1/pp3ppp/2p5/8/4qP2/2RBP2b/PP2Q1PP/5R1K b - - 0 1", solution: ["Rxd3","Rxd3","Bxg2+","Kg1","Bxf1","Qxf1"] },
  { fen: "1r2kb1r/p2n1ppp/2Q1pn2/8/3R4/2B5/qPP1NPPP/2KR4 b k - 0 1", solution: ["Ba3","bxa3","O-O"] },
  { fen: "2nq2k1/2r3pp/p1p1rp2/PpQ1N3/1P1PR3/8/5PPP/2R3K1 w - - 0 1", solution: ["Nf7","Qe8","Rxe6","Qxe6","Nd8"] },
  { fen: "rnbq1rk1/pp2p1bp/2p2pp1/3p4/2PP4/2NBP1P1/PP3PP1/R2QK1NR w KQ - 0 1", solution: ["Rxh7","Kxh7","Qh5+","Kg8","Bxg6"] },
  { fen: "3r2k1/q5pp/4bp2/prb1p3/8/3P2P1/n1RNPPBP/B2Q1RK1 w - - 0 1", solution: ["Rxa2","Bxa2","Qa4"] },
  { fen: "rn1r2k1/1b2bppp/p7/2pp2B1/4q3/1B2PN2/PP2QPPP/2RR2K1 w - - 0 1", solution: ["Rxc5","Bxg5","Nxg5","Qe7","Bxd5","Bxd5","Rcxd5"] },
  { fen: "6k1/1p3p2/5Qp1/2q1p1p1/P3P1P1/1r5P/3R2K1/8 b - - 0 1", solution: ["Rg3+","Kxg3","Qe3+","Qf3","Qxd2"] },
  { fen: "rnbqkbnr/p4ppp/2p5/1p6/2BpP3/2N2N2/PP3PPP/R1BQK2R w KQkq - 0 1", solution: ["Nxb5","Ba6","Qb3","Bxb5","Bxf7+","Kd7"] },
  { fen: "r4r2/n1q1k1pb/1p2P2p/p1p1P3/P4QP1/B1P5/B6P/2R2RK1 w - - 0 1", solution: ["Qf7+","Rxf7","Rxf7+","Kd8","Rd1+","Kc8","Rxc7+","Kxc7","Rd7+"] },
  { fen: "2r5/1p3Qpk/3q1n1p/2p1N3/1n6/6P1/5PBP/R5K1 w - - 0 1", solution: ["Be4+","Kh8","Ng6+","Kh7","Ne7+"] },
  { fen: "r1bq1rk1/ppp1b1pp/8/3nnp2/8/4P1PN/PP1N1PBP/R1BQ1RK1 w - - 0 1", solution: ["Nc4"] },
  { fen: "4r1k1/2q2p1p/p5pB/1pb2PPn/3Q4/1B5P/PP3P2/R5K1 w - - 0 1", solution: ["Bxf7+","Qxf7","Qxc5"] }
]

const PALOMITA_11 = [
  { fen: "r4rk1/6pp/p1p5/1p1pP3/3P2b1/1B2BPp1/PPR3Pq/3QRK2 b - - 0 1", solution: ["Rxf3+","Qxf3","Qh1+","Ke2","Qxg2+","Kd3","Qxf3"] },
  { fen: "2kr4/ppbr1ppp/2p1p3/2P2nP1/3PBP2/P1P4P/4N3/2KR3R b - - 0 1", solution: ["Ng3","Nxg3","Bxf4+","Kc2","Bxg3","Bxh7","g6"] },
  { fen: "3r2k1/pp2qppp/2pb1n2/5PQ1/6P1/8/PB1r1PBP/1R3RK1 b - - 0 1", solution: ["Rxb2","Rxb2","Qe5","Rfb1","Qxh2+","Kf1","Bf4"] },
  { fen: "8/pb3k2/1p6/2ppqBQ1/8/2P5/P5PP/6K1 w - - 0 1", solution: ["Bg6+","Ke6","Bf7+","Kd6","Qd8+","Kc6","Be8+"] },
  { fen: "8/B4kpp/2pp4/P7/4P3/8/1Pb3PP/6K1 w - - 0 1", solution: ["Bc5","Bd3","Bxd6"] },
  { fen: "3r3k/pp3rp1/1bp4p/4Q3/4PqP1/2PP1N2/P4PP1/R3R1K1 b - - 0 1", solution: ["Bxf2+","Kf1","Bxe1","Qxf4","Rxf4"] },
  { fen: "8/6pk/7p/2r2p2/5Pqn/1P6/P2Q2PP/2B2RK1 b - - 0 1", solution: ["Rxc1","h3","Nf3+"] },
  { fen: "r2qkb1r/1p3ppp/p7/3npP2/3n4/2N1B3/PP3PPP/R2QKB1R w KQkq - 0 1", solution: ["Bxd4","exd4","Qa4+","b5","Bxb5+","axb5","Qxb5+","Qd7","Nxd5","Qxb5","Nc7+","Kd7","Nxb5","Re8+","Kd2","Re5","Nxd4"] },
  { fen: "6k1/6pp/3n4/1n1p1P2/p1pP1NP1/PpP1K3/1B5P/8 b - - 0 1", solution: ["Nxa3","Bxa3","Nb5","Bc1","Nxc3"] },
  { fen: "1r4k1/q3pp2/3nb1p1/1pbN2p1/8/3Q2P1/P4PBP/3RR1K1 w - - 0 1", solution: ["Rxe6","fxe6","Qxg6+","Kf8","Rd3"] },
  { fen: "r3k2r/pp2p1bp/2bpPpp1/q7/6Q1/P1PB4/1P4PP/R1B2R1K w kq - 0 1", solution: ["Bxg6+","hxg6","Qxg6+","Kd8","Qxg7","Qh5","Bf4"] },
  { fen: "r1b4k/4q1pp/p1r5/2Np1p2/Pp1Pp3/4P1P1/1PR1QP1P/2R3K1 w - - 0 1", solution: ["Nxe4","Rxc2","Qxc2","fxe4","Qxc8+","Rxc8","Rxc8+"] },
  { fen: "r4rk1/pp1b2pp/2p3q1/3pP3/1bP1pB1P/1PN2PP1/P1Q1P3/3R1K1R b - - 0 1", solution: ["Rxf4","gxf4","Qg3","Nxe4","dxe4","Rxd7","Bc5"] },
  { fen: "r4rk1/2qbbp1p/p2p1np1/1pnPp1B1/2p1P2N/2P3NP/PPB1QPP1/R3R1K1 b - - 0 1", solution: ["Nxd5","Bxe7","Nxe7"] },
  { fen: "4qr1k/2Rr1npp/p3b3/1p2Pp2/1Q3B2/P4N2/5PPP/4R1K1 w - - 0 1", solution: ["Rxd7","Bxd7","e6","Bxe6","Rxe6","Qxe6","Qxf8#"] },
  { fen: "r4rk1/1n2qpbp/2bp1npB/1p2p2P/1P2P1P1/2N2PN1/P2Q2B1/2R1K2R w K - 0 1", solution: ["Nf5"] },
  { fen: "r4rk1/p1pqn1b1/1p1p2p1/3Pp1Pn/2P1P1bR/1P2B1N1/P2QN1B1/2K4R w - - 0 1", solution: ["Rxg4","Qxg4","Bh3","Qf3","Rf1","Nxg3","Rxf3","Rxf3","Nxg3","Rxg3","Be6+"] },
  { fen: "rn1qr3/1b1n2kp/ppp3p1/3pNp2/N2P4/1Q2P2B/PP3PPP/2RR2K1 w - - 0 1", solution: ["e4","Nxe5","dxe5","fxe4","Nxb6","Ra7","Qe3"] },
  { fen: "r1b2r2/1p1nq1bk/1np1p1pp/p7/3PN2N/1P2B3/2Q1BPPP/2RR2K1 w - - 0 1", solution: ["Nxg6","Kxg6","Bh5+","Kxh5","Ng3+","Kh4","Qe4+","Rf4","Qxf4#"] },
  { fen: "r1r2bk1/5p1p/pn4p1/N2b4/3Pp3/B3P3/2q1BPPP/RQ3RK1 b - - 0 1", solution: ["Bxa3","Rxa3","Qxe2","Qxb6","Rab8","Qd6","Qxf1+","Kxf1","Rb1+"] },
  { fen: "1q1r1nk1/rb2b1p1/pp3nP1/5B2/2PP4/7Q/PB4PP/R4RK1 w - - 0 1", solution: ["Be6+","Nxe6","Qxe6+","Kh8","Qh3+","Kg8","Rxf6","Bxf6","Qh7+","Kf8","Re1"] },
  { fen: "5rk1/1b3pbp/1p2p1pq/8/PNB3QP/1P4P1/3r1P2/2R2RK1 b - - 0 1", solution: ["Rxf2","Rxf2","Qxc1+"] },
  { fen: "4r3/1p4pk/2b2pq1/7p/3B1P2/7P/4RQP1/7K b - - 0 1", solution: ["Qxg2+","Qxg2","Rxe2"] },
  { fen: "3R1nk1/p4qpp/8/4QP2/2rB4/P7/3r3P/4R1K1 w - - 0 1", solution: ["Rxf8+","Qxf8","Qd5+","Kh8","Qxc4"] },
  { fen: "8/5pkp/4pbp1/3q4/3p1P2/1P1B2PK/4Q2P/3R2r1 b - - 0 1", solution: ["Rg2","Qe4","Rxh2+","Kxh2","Qh5+","Kg2","Qxd1"] },
  { fen: "2r2rk1/pQ2bppp/2n1pn2/1B1p4/q2P1B2/P3PP2/1P2KP1P/2R4R b - - 0 1", solution: ["Nxd4+","exd4","Rc2+","Bd2","Rxb2","Bxa4","Rxb7"] },
  { fen: "2kr3r/pb1n1p2/3qpP2/2b3B1/PpB2Q2/3p1PN1/1P4PP/R4R1K b - - 0 1", solution: ["Rxh2+","Kxh2","Rh8+"] },
  { fen: "4r1k1/p2b1p2/1p1q1n1p/3p2p1/P1pP2P1/2P1rPNP/3Q1K2/R3RB2 b - - 0 1", solution: ["Qxg3+","Kxg3","Ne4+"] },
  { fen: "5rk1/pp1qrp1p/3Nn1p1/3pP3/3P3Q/2R5/PP4PP/5R1K w - - 0 1", solution: ["Nf5","Ree8","Nh6+","Kh8","Qf6+","Ng7","Nxf7+"] },
  { fen: "3r3k/r1pn1ppp/1n2p3/pB2P3/Pp2PP1q/1Q6/1P1B1P1P/2R1K2R b K - 0 1", solution: ["Nxe5","fxe5","Qxe4+"] },
  { fen: "6k1/pp1r2p1/2q2P2/3p1PQ1/P3n3/8/BP5P/6RK w - - 0 1", solution: ["f7+","Rxf7","Qd8+","Kh7","Bxd5","Nf2+","Kg2","Qf6","Qxf6","Rxf6","Kxf2","Rxf5+","Bf3","Rf4","Rg4"] },
  { fen: "r3kbnr/ppp2ppp/8/n2qp3/2BP4/1QP2b2/PP1N1PPP/R1B1K2R w KQkq - 0 1", solution: ["Qa4+","Qd7","Bxf7+","Kd8","Qxd7+","Kxd7","Nxf3"] },
  { fen: "3r4/p1n1q1kp/1p3pp1/2p5/4N2P/1P4P1/PQ2PPK1/3R4 w - - 0 1", solution: ["Nxf6","Kf7","Rxd8","Qxd8","Nxh7"] },
  { fen: "3r4/k2r4/pq4pp/3B2b1/8/1N1R1Q2/PP4PP/1K6 b - - 0 1", solution: ["Rxd5","Rxd5","Qg1+","Kc2","Rc8+","Kd3","Qb1+","Kd4","Qxb2+"] },
  { fen: "2r5/kp1r1pp1/pR2pnp1/2Pq4/3P4/1Q6/4N1PP/1R4K1 w - - 0 1", solution: ["Rxa6+","bxa6","Qb6+","Ka8","Qxa6+","Ra7","Qxc8#"] },
  { fen: "2r5/1q2bpk1/r3p1p1/3pNn2/ppPP1P1p/3Q3P/PP2R1P1/2R1B1K1 b - - 0 1", solution: ["Nxd4","Qxd4","Bc5"] },
  { fen: "5r1k/p3N1bp/6p1/pR6/2P1R3/3p2q1/8/4Q2K b - - 0 1", solution: ["Qh3+","Kg1","d2","Nxg6+","hxg6","Qh4+","Kg8"] },
  { fen: "rn1qrbk1/2R2ppp/2p5/p3p3/Q7/P2PBNP1/1P2PPBP/6K1 w - - 0 1", solution: ["Rxf7","Kxf7","Qc4+","Kg6","Qg4+","Kf7","Ng5+"] },
  { fen: "b2r2k1/p4ppn/2qN2np/1p2P3/2p2PP1/1P2Q2P/PB5K/4RB2 b - - 0 1", solution: ["Nxf4","Qxf4","Qh1+","Kg3","Qg1+","Kh4","g5+"] },
  { fen: "r3kb1r/3n1ppp/p1ppq3/1p4B1/4P3/1PN5/1PQ2PPP/R4RK1 w kq - 0 1", solution: ["Rxa6","Rxa6","Nxb5","cxb5","Qc8#"] },
  { fen: "q4rk1/2r2ppp/1p2p3/3n4/2BP1b2/1Q4P1/PB3P1P/1R1R2K1 b - - 0 1", solution: ["Rxc4","Qxc4","Ne3","Qf1","Nxf1"] },
  { fen: "2r3k1/p4pp1/1q2pn1p/1Pb5/4P3/PQ3NPP/3pRP2/5BK1 b - - 0 1", solution: ["Bxf2+","Rxf2","Nxe4"] },
  { fen: "8/1p1b3p/4npp1/PPPk1p2/5P2/3BB1P1/7P/6K1 w - - 0 1", solution: ["c6","bxc6","b6","Bc8","a6","Nd8","Bf1"] },
  { fen: "1r3rk1/1PQ3pp/p3pn2/1p2p3/4P3/5N1P/1b3PP1/q1B1RNK1 b - - 0 1", solution: ["Bxc1","Rxc1","Rxb7"] },
  { fen: "1q2kb1r/1r1n1ppp/2Qpp3/8/N7/8/1PP2PPP/R1BR2K1 w k - 0 1", solution: ["Nc5","dxc5","Bf4","Qxf4","Qxb7"] },
  { fen: "r1b1r1kb/1pqn1p1p/2pp1npB/8/2PNP3/1PN3PP/3Q1PB1/3RR1K1 w - - 0 1", solution: ["Nf5","gxf5","Qg5+","Bg7","Qxg7#"] },
  { fen: "R6r/4kpp1/1q1bp2p/3n4/1p5P/6Q1/PP1B1PP1/1K2R3 w - - 0 1", solution: ["Rxe6+","Kxe6","Qg4+"] },
  { fen: "r3r1k1/pp1n1pp1/2p4p/q2p1P2/3b2n1/1PNP2PP/PB1Q1PB1/3R1RK1 b - - 0 1", solution: ["Ne3","fxe3","Bxe3+"] },
  { fen: "r5k1/p7/4Nnp1/3q4/8/4Q2R/PP2KP1P/8 w - - 0 1", solution: ["Rh8+","Kf7","Ng5+","Kg7","Rxa8"] },
  { fen: "4r2k/p5qp/bp2B1p1/3P1p2/2n2N2/2R5/PQ3PPP/6K1 w - - 0 1", solution: ["Nxg6+","Qxg6","Rxc4+","Qg7","Qxg7+","Kxg7","Rc7+"] }
]

const PALOMITA_12 = [
  { fen: "2r2rk1/1p3pp1/4n3/1P1Rn1q1/4P2p/7P/2P2QN1/R4BK1 b - - 0 1", solution: ["Rxc2","Qxc2","Nf3+","Kf2","Qg3+","Ke2","Nfd4+","Kd1","Nxc2"] },
  { fen: "bq3rk1/2pnnppp/3p1b2/1p1Pp3/4P3/NBP2N1P/1P3PP1/2BQR1K1 w - - 0 1", solution: ["Nxb5","Qxb5","Ba4"] },
  { fen: "8/1q4kp/2np1p2/4p3/2PpP2P/6P1/r1PQ2BK/5R2 w - - 0 1", solution: ["Rxf6","Kxf6","Qh6+","Kf7","Qxh7+","Kf6","Qxb7"] },
  { fen: "8/pR6/4p1k1/2p1P1rn/P3R3/4N1P1/4r2P/6K1 b - - 0 1", solution: ["Nxg3","hxg3","Rxg3+","Kf1","Rexe3","Rxe3","Rxe3","Rxa7","Kf5"] },
  { fen: "2r3k1/pppqrpb1/3n1npp/3Pp3/P3P3/BP3NP1/2R1QPBP/2R3K1 w - - 0 1", solution: ["Bh3","Qxh3","Bxd6"] },
  { fen: "3n4/pp3p2/4k2p/1PP1p3/4NP2/Pb2K3/6BP/8 w - - 0 1", solution: ["c6","exf4+","Kxf4","bxc6","Nc5+","Kd6","Nxb3"] },
  { fen: "3r2k1/2R2pp1/7B/p3p3/qb4Q1/7P/1P3PPK/2r5 b - - 0 1", solution: ["Rh1+","Kxh1","Qd1+","Kh2","Qxg4","hxg4","gxh6"] },
  { fen: "2r3k1/p1r1qp1p/1p3np1/nP2p1N1/7Q/3N2P1/P3PPKP/2RR4 w - - 0 1", solution: ["Nxh7","Nxh7","Qxe7","Rxe7","Rxc8+"] },
  { fen: "r1bb1r1k/p4ppp/2p2n1N/7Q/2p5/2B2N2/qPP2PPP/2KR3R w - - 0 1", solution: ["Qxf7","Qa1+","Kd2","Rxf7","Nxf7+","Kg8","Rxa1"] },
  { fen: "1r4k1/3q1p2/p4P1p/2r1p1bQ/4p3/2P3R1/P5PP/5R1K b - - 0 1", solution: ["Qf5","Kg1","Qg6","Qe2","Rc6","h4","Rxf6"] },
  { fen: "3r4/1q5k/p3p1pp/2p1Rp1n/2P2P2/P4b1P/1PB4K/2B3Q1 b - - 0 1", solution: ["Qxb2","Bxb2","Rd2+"] },
  { fen: "4b3/r4kp1/4Rn1p/p4p2/P4N2/6P1/P1r3BP/4R1K1 w - - 0 1", solution: ["Rxf6+","Kxf6","Rxe8"] },
  { fen: "7k/p6p/2P1nNp1/4rbP1/3p3P/P3P3/3KB3/7R w - - 0 1", solution: ["e4","Bxe4","Nxe4","Rxe4","Rb1","Re3","Rb8+","Kg7","Bc4"] },
  { fen: "2r5/5pk1/4pqp1/p4p2/5P2/QPr3PP/P2R3K/4R3 b - - 0 1", solution: ["Rxg3","Kxg3","Qc3+","Kf2","Qxd2+"] },
  { fen: "3r1rk1/1p4p1/p1p1qpQ1/8/1P3Pp1/P2R2Pn/1B2P2P/3R1K2 b - - 0 1", solution: ["Qe3","Ke1","Qg1+","Kd2","Rxd3+","exd3","Qxh2+","Kc3","Qxg3"] },
  { fen: "r3r1k1/p3q3/1pn1b1pB/2p1PpN1/5P1Q/7R/P1p3PP/4R1K1 w - - 0 1", solution: ["Bf8","Kxf8","Qh8+","Bg8","Rh7"] },
  { fen: "5n2/3bp1r1/1r1p3k/p1p2pNp/1nP2P1P/1PN1PB1K/P5R1/6R1 w - - 0 1", solution: ["Nf7+","Rxf7","Rg5"] },
  { fen: "1br4k/pp4pp/8/2n1q2b/P7/6PP/1P1NnPBK/R1B1NQ2 b - - 0 1", solution: ["Nxg3","fxg3","Qxg3+","Kg1","Qh2+","Kf2","Bg3+","Ke3","Bxe1"] },
  { fen: "5rk1/R5pp/4p1q1/1p2Q3/2p2nN1/2Pr3P/1P3PP1/R5K1 b - - 0 1", solution: ["Nxh3+","gxh3","Rxh3","Qd4","Rd3"] },
  { fen: "4k1r1/pQ1n1p1R/1pq5/5P2/2r5/P7/5PB1/3R2K1 w - - 0 1", solution: ["Rh8","Qxb7","Rxg8+","Ke7","Bxb7"] },
  { fen: "rqr3k1/1b1nbppp/ppnpp3/8/N1PNP3/1P4P1/PB2QPBP/2RR2K1 w - - 0 1", solution: ["Nxe6","fxe6","Qg4","Nf6","Qxe6+","Kh8","Nxb6"] },
  { fen: "1rbq1rk1/4ppbp/3pn1p1/1p1Nn3/1P6/2N3P1/P2BPPBP/2RQ1RK1 w - - 0 1", solution: ["Nxb5","Rxb5","Rxc8","Qxc8","Nxe7+","Kh8","Nxc8"] },
  { fen: "7k/6p1/5p2/2B4p/5P2/Q4K1P/6P1/4q1b1 b - - 0 1", solution: ["Qf1+","Kg3","h4+","Kg4","Qxg2+","Kxh4","g5+","Kh5","gxf4"] },
  { fen: "r4r1k/1p5p/1bp2N2/2n1p1B1/p3P3/2P5/PPB2PP1/3R2K1 b - - 0 1", solution: ["h6","Bh4","Bd8"] },
  { fen: "r2q2k1/p2rppbp/1pp3p1/4B3/NPPP2b1/P3Q3/5PPP/R4RK1 w - - 0 1", solution: ["Bxg7","Kxg7","d5","Kg8","dxc6"] },
  { fen: "2r4k/1p3pbp/p1b2N2/4r1q1/2pN1R2/7P/PPP2QP1/3R2K1 b - - 0 1", solution: ["Bxf6","Rxf6","Bxg2","h4","Qg4"] },
  { fen: "2rqr1k1/1b1n1ppp/p1n1pbP1/3p3P/3N1PQ1/2PN4/1P3BB1/R2R2K1 w - - 0 1", solution: ["gxf7+","Kxf7","Nxe6","Rxe6","Bxd5"] },
  { fen: "5rk1/3qbp1p/p1r5/1p2Np2/8/1P2Q1P1/P3PP1P/R5K1 b - - 0 1", solution: ["f4","Qxf4","Qc7","Nxc6","Qxc6"] },
  { fen: "r7/1p2q1k1/5pp1/nPr4p/3RP3/3B3P/5QP1/5RK1 w - - 0 1", solution: ["Qxf6+","Qxf6","Rd7+","Kh6","Rxf6"] },
  { fen: "q4rbk/p1r4p/6B1/4b3/Ppp2N2/1n2B1PQ/1P5P/4RRK1 w - - 0 1", solution: ["Bxh7","Rxh7","Ng6+","Kg7","Qd7+","Rf7","Rxf7+","Bxf7","Nxe5"] },
  { fen: "R4bk1/5pp1/5n1p/4Q3/3B4/1qprPBP1/5P1P/6K1 w - - 0 1", solution: ["Rxf8+","Kxf8","Qc5+","Kg8","Qc8+","Kh7","Qf5+","Kg8","Qxd3"] },
  { fen: "r1bqr1k1/1p3ppp/2pp1n2/p1b1n3/2PNP3/2NBB2P/PPQ2PP1/4RRK1 b - - 0 1", solution: ["Bxh3"] },
  { fen: "1k1r4/pp2n1pp/3r1pb1/2Np4/8/1P4PP/P1R1PPB1/2R1K3 w - - 0 1", solution: ["Nxb7","Bxc2","Nxd6","Bxb3","Nf7","Rf8","axb3","Rxf7","Rc5"] },
  { fen: "2r1r1k1/q2bb2p/p2p1pp1/1p1P4/8/1P5P/PQ3PP1/BB1RR1K1 w - - 0 1", solution: ["Rxe7","Rxe7","Qxf6","Re5","Qxd6"] },
  { fen: "r2q1rk1/4npbp/b1p1pnp1/p3N3/2BP2P1/B4N2/PP3P1P/2RQR1K1 w - - 0 1", solution: ["Nxf7","Rxf7","Bxe6"] },
  { fen: "r2r2k1/p3pp1p/2p2npQ/6N1/2b3P1/2P2R1P/Pq3P2/5RK1 w - - 0 1", solution: ["Rxf6","exf6","Qxh7+","Kf8","Re1","Be6","Rxe6"] },
  { fen: "4r3/pp1nr3/2p4p/4pkb1/4RP2/1PBN2P1/P1P1K3/3R4 w - - 0 1", solution: ["g4+","Kxe4","Nf2+","Kxf4","Rg1","e4","Nh3#"] },
  { fen: "6k1/6p1/4p2p/4N3/3P2Pq/4PP2/n6P/2R3K1 w - - 0 1", solution: ["Rc8+","Kh7","Rh8+","Kxh8","Ng6+","Kh7","Nxh4"] },
  { fen: "r3qrk1/2p2pb1/p6p/1p2pb2/5p2/1BP2N2/PP3PPP/R2QR1K1 w - - 0 1", solution: ["Nxe5","Bxe5","Qh5"] },
  { fen: "r5k1/p5p1/7p/Q2N1b2/8/1P3q1P/2P1rP2/2KR2R1 w - - 0 1", solution: ["Nf6+","Kf7","Qc7+","Re7","Rxg7+","Kxg7","Qxe7+","Kh8","Rg1"] },
  { fen: "r3bqk1/1p2rppn/p3p2p/3pP2Q/3P1RN1/2PB3P/PP4P1/R5K1 w - - 0 1", solution: ["Nf6+","Nxf6","exf6","gxf6","Rxf6","Qg7","Rxh6","f5","Qh4"] },
  { fen: "rnb3k1/pp4pp/3p3r/2p1p1qn/P1PPPpP1/2PB1P2/3QNB1P/R5RK b - - 0 1", solution: ["Ng3+","Kg2","Qh4","Bxg3","fxg3","hxg3","Qh2+","Kf1","Rf6"] },
  { fen: "r3r1k1/p1qn1pbp/2p2np1/1p6/2BPp3/BPN1P2P/P3QPP1/2RR2K1 w - - 0 1", solution: ["Nxb5","Qa5","Nd6","Qxa3","Bxf7+","Kh8","Nxe8","Nxe8","Bxe8","Rxe8","Rxc6"] },
  { fen: "r2qr1k1/ppp2ppp/3p1b2/1B1P1b2/5P2/2P1B1P1/PP1Q3P/R3K2R b KQ - 0 1", solution: ["c6","dxc6","Qb6"] },
  { fen: "5r1k/6pp/p7/1pnP3q/2p1P3/2P4b/PPB4Q/4R1NK b - - 0 1", solution: ["Bg2+","Kxg2","Rf2+","Kxf2","Qxh2+","Kf3","Qxc2"] },
  { fen: "4r1k1/4qRpp/p2p4/1p2r3/8/2Pn1Q2/PP4PP/5R1K b - - 0 1", solution: ["Re1","Qd5","Qxf7","Qxf7+","Kh8","Kg1","Rxf1+","Qxf1","Re1"] },
  { fen: "r1bqr1k1/p1n2pbp/1p1p2p1/2pP4/P3P1n1/2N4P/1PQNBPP1/R1B1R1K1 b - - 0 1", solution: ["Nxf2","Kxf2","Qh4+","Kf1","Bd4","Nd1","Qxh3","Bf3","Qh2"] },
  { fen: "1r1r2k1/1p3p2/p1p2bp1/7p/2Pn3P/2B1q1P1/PP1RPQB1/2R3K1 b - - 0 1", solution: ["Nxe2+","Rxe2","Qxc1+","Re1","Bxc3","Rxc1","Bd4"] },
  { fen: "1r1nkn1r/4bp1p/p1p4B/1pqpPQ2/8/1B5P/PP1N2P1/R4R1K w k - 0 1", solution: ["Ne4","dxe4","Rad1"] },
  { fen: "r2qr1k1/pp2bppp/2b1p3/3nN1B1/3P4/1BPR4/P3QPPP/4R1K1 w - - 0 1", solution: ["Nxf7","Kxf7","Qxe6+","Kf8","Bc1"] },
  { fen: "r7/2k1Pp1p/p1n2p2/P1b1r3/2p5/2P3P1/5P1P/1R1Q2K1 w - - 0 1", solution: ["Rb7+","Kxb7","Qd7+","Kb8","e8=Q+","Rxe8","Qxe8+","Kb7","Qd7+","Kb8","Qxc6"] }
]

const PALOMITA_13 = [
  { fen: "r4rk1/1q1nbppp/p1b5/4pP2/NpP1Nn2/1B3Q2/PP3BPP/R3R1K1 b - - 0 1", solution: ["g6","fxg6","f5"] },
  { fen: "3rr1k1/3nbppp/p1R2n2/q2Bp3/1p2P3/5N1P/PP1B1PP1/2RQ2K1 w - - 0 1", solution: ["Bxf7+","Kxf7","Qb3+","Kf8","Ng5"] },
  { fen: "r4k1r/1q2bp1p/p3pp2/3p3Q/1p1N1P2/4R3/PPP3PP/1K1R4 w - - 0 1", solution: ["Rxe6","fxe6","Nxe6+","Kg8","Rd3"] },
  { fen: "6k1/6pp/p4p2/2pN3b/2P1r3/1P6/P5PP/5RK1 w - - 0 1", solution: ["Rxf6","gxf6","Nxf6+","Kf7","Nxe4"] },
  { fen: "r1b1r1k1/2q1bppp/p2p1n2/1p2p3/3PP3/1B1n1N1P/PB1N1PP1/R2QR1K1 w - - 0 1", solution: ["Bxf7+","Kf8","Bxe8","Nxb2","Qb1","Na4","Rc1"] },
  { fen: "r1bq1rk1/5ppp/p1Np1b2/1p6/4P3/P4Q1P/1PBB1nP1/R3R1K1 b - - 0 1", solution: ["Nxh3+","Kh2","Be5+","Nxe5","dxe5"] },
  { fen: "2r3k1/1nqbrp2/p5pp/1p1Pp1N1/8/1P5P/P1B2PP1/2RQR1K1 w - - 0 1", solution: ["Nxf7","Rxf7","Bxg6","Qd6","Bxf7+","Kxf7","Rxc8","Bxc8","Qc2"] },
  { fen: "1r1qrbk1/1p3p1p/p2p2p1/P2NpBn1/4P3/2P3P1/1P3P1P/R2Q1RK1 w - - 0 1", solution: ["Bd7","Re6","Bxe6"] },
  { fen: "5rk1/7p/pqb1Ppp1/1p3p2/7R/2N5/PPPQ2PP/7K w - - 0 1", solution: ["e7","Re8","Nd5","Bxd5","Qxd5+","Kg7","Rxh7+","Kxh7","Qf7+","Kh6","Qxe8","Qf2","Qh8+","Kg5","h4+","Kg4","e8=Q"] },
  { fen: "2r1rbk1/2q3pp/p1b2p2/1p1pnN2/4P1Q1/1P5P/PB3PP1/1B1RR1K1 w - - 0 1", solution: ["Bxe5","Rxe5","Nh6+","Kh8","Nf7+","Qxf7","Qxc8"] },
  { fen: "8/3nbp1k/ppR4p/5P1N/P3P2P/1r3B2/6K1/8 b - - 0 1", solution: ["Rxf3","Rc7","Rd3"] },
  { fen: "r1b1k1nr/1p1n1pbp/p1pQ2p1/4p3/2B1PB2/2q2N2/P1P2PPP/1R1R2K1 w kq - 0 1", solution: ["Bxf7+","Kxf7","Ng5+","Ke8","Qe6+"] },
  { fen: "2rrb1k1/p4ppp/4pn2/1p2N3/3P4/qBPQ3R/P4PPP/4R1K1 w - - 0 1", solution: ["Ng4","Nxg4","Qxh7+","Kf8","Qh8+","Ke7","Qxg7"] },
  { fen: "r1b4r/1p2kp2/pqp1pp2/7p/4P3/3R4/P1PQBPPP/3R2K1 w - - 0 1", solution: ["e5"] },
  { fen: "3r1k2/5p2/r1p2p1p/1p6/n1bP1NP1/R1P2P2/2BK3P/R7 w - - 0 1", solution: ["Bxa4","Rda8","Bxb5","Bxb5","Rxa6","Rxa6","Rxa6","Bxa6"] },
  { fen: "3qr1k1/1b1n1p1p/p2Pp1p1/2p1PP2/r1Bp4/6QP/4NRP1/2R3K1 b - - 0 1", solution: ["Rxc4","Rxc4","exf5"] },
  { fen: "r4bk1/2pQ2p1/p6B/2n1qp2/p7/2P3RP/5PP1/1R4K1 w - - 0 1", solution: ["Bxg7","Bxg7","Rxg7+","Qxg7","Qd5+","Kh7","Qxa8"] },
  { fen: "r2q1rk1/1p3pbp/p2p2p1/nPpPp2n/4P3/3Q2P1/PPNB1PBP/R4RK1 w - - 0 1", solution: ["b6"] },
  { fen: "3r1k2/p5pp/2P5/1R4p1/2n5/1Bb4P/P4PP1/5K2 w - - 0 1", solution: ["c7","Re8","Rb8","Nb6","Ba4","Rc8","Bd7"] },
  { fen: "3r2k1/2q1bppp/2n1b3/1ppPp3/8/2P2N1P/1PB2PP1/2BQR1K1 w - - 0 1", solution: ["Bxh7+","Kxh7","Qc2+","Kg8","dxe6","fxe6"] },
  { fen: "N5k1/pp2r1bp/3p4/3P4/7q/4Q2b/PP3N1P/2R1K1R1 w - - 0 1", solution: ["Rxg7+","Kxg7","Rc7","Bd7","Rxd7","Rxd7"] },
  { fen: "1r4k1/3b1q1p/pr1p1np1/2pP4/2Bb2P1/1PN2P2/Q2B2KP/1RR5 b - - 0 1", solution: ["Nxg4","fxg4","Qf2+","Kh3","Qf3+","Kh4","Qxg4#"] },
  { fen: "r3k2r/2q1np1p/p2pP1p1/1p2n2Q/8/2PBB3/P1PR2PP/5RK1 w kq - 0 1", solution: ["Qxe5","dxe5","exf7+","Kd7","Bf5+","Kc6","Be4+","Nd5","Rxd5"] },
  { fen: "2b2r1k/r5pp/p1B2p2/2q5/Pp6/1Pp5/2P1QPPP/3RR1K1 w - - 0 1", solution: ["Qe8","Raf7","Rd8"] },
  { fen: "r1bq1rk1/ppp1npbp/3p2p1/4p3/3nP3/3PBNP1/PPPQNPBP/R3K2R b KQ - 0 1", solution: ["Bh3","Nfxd4","Bxg2","Rg1","exd4"] },
  { fen: "r1bk1bQ1/1p1pRr2/p2n1P2/5P2/3p1N2/8/qPP3PP/4R2K w - - 0 1", solution: ["Ne6+","dxe6","Rxf7","Nxf7","Qxf8+","Kc7","Qxf7+"] },
  { fen: "r1r3k1/5p1p/3b2p1/3Pp3/4B1P1/1PR5/qPK1Q2P/2BR4 b - - 0 1", solution: ["Rxc3+","Kxc3","Bb4+","Kxb4","Qa5+","Kc4","Qa6+"] },
  { fen: "r1b2r1k/1pq2p1p/p3pp2/4b3/6Q1/1N1B4/PPP3PP/1K1R1R2 w - - 0 1", solution: ["Bxh7","Kxh7","Rf3"] },
  { fen: "3qnrk1/r3bppp/p2p3B/2p1pN2/P3P2N/1b1P1Q2/1P3PPP/R4RK1 w - - 0 1", solution: ["Nxg7","Nxg7","Qg3","Bg5","Bxg5","f6","Bh6"] },
  { fen: "2q2rk1/3rbpn1/pB2p1pQ/1p2P2p/4B3/8/PPP3PP/4RR1K w - - 0 1", solution: ["Rxf7","Rxf7","Bxg6","Nf5","Bxf7+","Kxf7","Qh7+"] },
  { fen: "1r3rk1/2Q2p1p/4q1p1/1b6/8/p1BnP1P1/PP4BP/R4RK1 w - - 0 1", solution: ["Rxf7","Rxf7","Qxb8+","Be8","Bd4","axb2"] },
  { fen: "2r1r1k1/1ppb1pp1/p1np2np/3Np3/3PP3/2P2qP1/PP1Q1P1P/R2BR1K1 b - - 0 1", solution: ["Nh4","gxh4","Qh3","Nf6+","gxf6","Qxh6","exd4","Kh1","Ne5","Rg1+","Bg4","Rg3","Qf1+","Rg1","Qh3"] },
  { fen: "2rq1bk1/pp1b1pp1/5n1p/n2BrN2/8/2N1B1PP/PPQ1PP2/3R1RK1 w - - 0 1", solution: ["Nxh6+","gxh6","Qg6+","Kh8","Bxf7","Rh5"] },
  { fen: "6r1/pp2Q1pk/7p/2p2N2/1qP1P3/1P3rP1/P4P1P/5RK1 w - - 0 1", solution: ["Nxh6","Kxh6","Qh4+","Kg6","Qg4+","Kh6","Qxf3"] },
  { fen: "6R1/1p4p1/1N6/p3r2p/Pb4kP/5rP1/1PRn1PK1/8 b - - 0 1", solution: ["Rxg3+","fxg3","Re2+","Kh1"] },
  { fen: "4qr2/1b1n2k1/r2P1p2/1p2pR1p/2p5/2P4P/1PBQ2P1/5R1K w - - 0 1", solution: ["Rg5+","Kf7","Bg6+"] },
  { fen: "4r1k1/4b1n1/1q3rP1/p2p1p2/1p3B2/5NN1/PPPQ1P2/1K5R w - - 0 1", solution: ["Bc7","Qxc7","Rh8+","Kxh8","Qh6+","Kg8","Qh7+","Kf8","Qh8#"] },
  { fen: "4rbk1/1q3ppp/3pp3/2n5/3NP3/BP2Q3/5PPP/4R1K1 b - - 0 1", solution: ["Nxe4","Qxe4","d5"] },
  { fen: "2b2k2/2p2r1p/p2pR3/1p3PQ1/3q3N/1P6/2P3PP/5K2 w - - 0 1", solution: ["Ng6+","hxg6","Qd8+","Kg7","Rxg6+","Kh7","Qg8#"] },
  { fen: "r2q1rk1/ppp3p1/2npbn1p/3N4/2PP4/3Q2P1/PP4BP/R1B2RK1 w - - 0 1", solution: ["Bxh6","Bxd5","cxd5","Nb4","Qg6"] },
  { fen: "3rn1k1/1pr1bpp1/pn2p1p1/q3P3/3N2P1/P3B2P/1P1R1PB1/R2Q2K1 w - - 0 1", solution: ["Nxe6","fxe6","Rxd8","Bxd8","Qxd8"] },
  { fen: "5rk1/7p/1npq2pQ/pp2pp2/4P2P/1PPr1BP1/P2N2K1/2BR4 b - - 0 1", solution: ["Rxf3","Nxf3","Qxd1"] },
  { fen: "r1bk1b1r/pp1np1p1/1q3nBp/4p3/2PN4/8/PP1B1PPP/R2Q1RK1 w - - 0 1", solution: ["c5","Nxc5","Ba5","exd4"] },
  { fen: "r2q1rk1/1b2bppp/p2ppn2/8/1BR1P3/1PN3P1/P2Q1PBP/R5K1 w - - 0 1", solution: ["e5","Nd5","Nxd5","exd5","Bxd5"] },
  { fen: "1r3rk1/p3pp1p/1q1p1npQ/3P1nN1/1pp5/2N4P/PPP1B1P1/R4R1K w - - 0 1", solution: ["Rxf5","gxf5","Nce4","fxe4","Rf1"] },
  { fen: "rR6/2nb2kp/2Np2p1/3Pp2n/1P2Pp2/3q1N1P/1Q3PP1/6K1 w - - 0 1", solution: ["Ncxe5","Qd1+","Kh2","Ra1","Ng4+","Kf7","Nh6+","Ke7","Ng8+","Kf7","Ng5#"] },
  { fen: "r1b1k2r/pp1nbppp/1q2pn2/6N1/2Bp4/5N2/PPP2PPP/R1BQR1K1 w kq - 0 1", solution: ["Nxf7","Kxf7","Rxe6","Qb4","Rxf6+","Kxf6","Qxd4+"] },
  { fen: "1r2r1k1/3b1n1p/1q2pbp1/1p1p4/1N3N2/1P4PP/P2Q1PB1/R2R2K1 w - - 0 1", solution: ["Nbxd5","exd5","Nxd5","Qd6","Nxf6+","Qxf6","Qxd7"] },
  { fen: "2r4k/5p1p/2bQP3/5pr1/1PpR1P2/2q5/P4K1P/4R3 w - - 0 1", solution: ["Qe5+","Rg7","Rd8+","Rxd8","Qxc3"] },
  { fen: "r4rk1/pp2ppbp/3p2p1/5P2/3BP1n1/2N5/PqP1Q2P/3R1RK1 w - - 0 1", solution: ["f6","Bxf6","Rxf6","Nxf6","Nd5"] },
  { fen: "3r2k1/pp2ppbp/6p1/n2p4/3P2b1/PP2PNP1/R4PKP/B1rB1R2 b - - 0 1", solution: ["Nxb3","Bb2","Rb1","Bxb3","Bxf3+","Kg1","Rxf1+","Kxf1"] }
]

const PALOMITA_14 = [
  { fen: "4N1r1/p3n1pQ/1p2p2P/1P2kp2/r5P1/8/5P1K/8 w - - 0 1", solution: ["Qxg8"] },
  { fen: "r4rk1/p4ppp/1pn1pn2/3q4/3P4/2PBBP2/P1Q2P1P/2KR3R b - - 0 1", solution: ["Nb4","Qb3","Nxd3+"] },
  { fen: "r3r1k1/3q1ppp/5n2/2Rp4/p4P2/P2QPNPP/P3K3/7R b - - 0 1", solution: ["Ne4","Rxd5","Qxd5"] },
  { fen: "6k1/p4ppp/4p3/1r2P3/3p1q1P/1r1P4/QP2KNP1/1R5R b - - 0 1", solution: ["Rxe5+","Kf1","Rf5"] },
  { fen: "2r2bk1/8/4p1p1/4PpP1/1pqBpP2/r1P1R3/PQR3K1/8 b - - 0 1", solution: ["Rxa2","Qxa2","b3","Qb2","bxc2","Qxc2","Qxd4"] },
  { fen: "2rq1r1k/3b1pp1/p3pb1p/1p6/1PN1B3/4PN2/2Q2PPP/3R1RK1 w - - 0 1", solution: ["Rxd7","Qxd7","Nb6","Rxc2","Nxd7","Rc4","Nd2"] },
  { fen: "2kr3r/pp3pp1/2pPp1p1/4P3/3Q1P2/P1n4P/2qB2PK/RR6 b - - 0 1", solution: ["Rxh3+","gxh3","Nxb1","Rxb1","Qxb1","Qxa7","Qb5","Ba5","Re8"] },
  { fen: "r6r/1q5k/p5pn/3pQ1P1/1P4P1/2P4R/2P4P/6K1 b - - 0 1", solution: ["Kg8"] },
  { fen: "rnbqk2r/pp2bppp/2p5/3p2B1/3Pn3/2N1P3/PPQ2PPP/R3KBNR w KQkq - 0 1", solution: ["Bxe7","Qxe7","Nxd5","cxd5","Qxc8+"] },
  { fen: "rb1qrnk1/p4ppp/1ppP1p2/2P5/8/1B1bB2P/PP1N1PP1/R2Q1RK1 w - - 0 1", solution: ["Bxf7+","Kxf7","Qb3+","Re6","Qxd3"] },
  { fen: "3r1rk1/1p4bp/1qp3p1/p1n5/2PR2P1/1PB4P/PQ3PB1/5RK1 b - - 0 1", solution: ["Na4","bxa4","Qxb2","Bxb2","Bxd4"] },
  { fen: "5rk1/R4pp1/7p/p2r4/4Q3/3n3P/1q2BPP1/3R2K1 b - - 0 1", solution: ["Nxf2","Rb7","Rxd1+","Bxd1","Qd2"] },
  { fen: "2r2k2/8/p1pP1r2/2P2p2/B4ppp/7P/PP3PP1/4R1K1 w - - 0 1", solution: ["Bxc6","Kg7","Re7+","Kf8","Re5","Rxc6","d7","Rfd6","Rxf5+","Kg7","Rg5+","Kh6","cxd6","g3","Kf1","Rxd6","Rg4"] },
  { fen: "rn4k1/ppb2qp1/2p3r1/4PN2/5PQ1/5R2/PP4PP/3R2K1 w - - 0 1", solution: ["Qxg6","Qxg6","Ne7+","Kf7","Nxg6","Kxg6"] },
  { fen: "r3r1k1/p4p1p/q2p2p1/3P4/Pp1QnP2/6P1/1P5P/RN2R1K1 b - - 0 1", solution: ["Nxg3","Rxe8+","Rxe8","hxg3","Re1+","Kh2","Qe2+","Kh3","Rh1#"] },
  { fen: "2r1n1k1/2q1bpp1/p1r4p/8/N1NRP3/8/P3QPPP/2R3K1 b - - 0 1", solution: ["Bf6","e5","Bxe5","Re4","Nf6","Rxe5","Rxc4","Rxc4","Qxc4","Qxc4","Rxc4"] },
  { fen: "r4rk1/1ppb1pb1/3p1qp1/2nPp2p/p1P1P2P/P1N3PB/1P3P1K/1R1QNR2 b - - 0 1", solution: ["Bxh3","Kxh3","Nxe4","Nxe4","Qf5+","Kh2","Qxe4"] },
  { fen: "r1n1q1k1/5rpp/4b3/p2pPp2/2pP1P1Q/B1P2R2/2B3PP/R5K1 w - - 0 1", solution: ["Ba4","Bd7","e6","Qxe6","Qd8+","Qe8","Qxe8+","Bxe8","Bxe8"] },
  { fen: "1n3rk1/7q/p1P2p2/1n1P1Rpp/1Q6/3N4/4r1PP/5RK1 w - - 0 1", solution: ["Rxg5+","Kf7","Rxf6+","Kxf6","Qxf8+","Kxg5","h4+"] },
  { fen: "2k4r/p3qp2/bp1r1npp/n1pPp3/2P1P2B/P1PB1N2/6PP/R2Q1RK1 w - - 0 1", solution: ["Nxe5","Qxe5","Bg3","Qe7","e5","Rd7","Rxf6"] },
  { fen: "5rk1/p1r2qpp/8/2p1Rp2/1n2n2P/1P2P1P1/PB3PB1/2RQ2K1 w - - 0 1", solution: ["Bf1","Kh8","Bc4","Qf6","Re8","Rxe8","Bxf6"] },
  { fen: "rn2brk1/5ppp/1q2p3/p2p4/3P4/P1NBQ3/1P3PPP/2R1R1K1 w - - 0 1", solution: ["Nxd5","exd5","Qxe8"] },
  { fen: "3qk3/pr3ppr/4p1n1/1p1pP3/b1pP2B1/2P3P1/2P2RP1/2BQ1RK1 w - - 0 1", solution: ["Bxe6","fxe6","Qg4"] },
  { fen: "r4rk1/p1n1B1pp/bp1p4/2p1pP2/2PnP1PQ/Pq1B3N/1P5P/3R1RK1 b - - 0 1", solution: ["Qxd1","Rxd1","Nf3+","Kg2","Nxh4+","Bxh4"] },
  { fen: "3rr3/5pkp/p1b3p1/4p3/p2nPn2/N6P/2P2PP1/R1N1RBK1 b - - 0 1", solution: ["Nxh3+","gxh3","Nf3+","Kh1","Nxe1"] },
  { fen: "2rr1nk1/pp3ppp/4qn2/3p1N2/6P1/2BQP2P/PP3P2/1K1R3R w - - 0 1", solution: ["Nxg7","Kxg7","g5","N8d7","Qxd5"] },
  { fen: "r4rk1/1ppb4/n2p1npb/3Ppp1q/1PP1P3/2N2NP1/2Q1BB2/1R1R2K1 w - - 0 1", solution: ["Nxe5","Qh3","Bf1","Qh5","Be2","Qh3","Bf1","Qh5"] },
  { fen: "2r5/p4pk1/1p4pp/4P2n/6R1/5Q2/PPBr3q/1K1R4 w - - 0 1", solution: ["Rxg6+","fxg6","Qb7+","Kh8","Qxc8+"] },
  { fen: "2r5/7p/3q2k1/p2Np1p1/Pp1bPpP1/1P3P2/4Q2P/3R3K w - - 0 1", solution: ["Ne7+","Qxe7","Qa6+","Kg7","Qxc8"] },
  { fen: "4r1k1/pp3pp1/5q1p/P1Rp4/3P1nP1/1P3PN1/3Q1K1P/1b3B2 b - - 0 1", solution: ["Bd3","Nf5","Qg5","Ne3","Qh4+","Kg1","Bxf1"] },
  { fen: "r4r2/1p2pkbQ/5qp1/8/p3P3/4B2R/P4PP1/2R2K2 w - - 0 1", solution: ["e5","Qxe5","Bh6"] },
  { fen: "2r1r1k1/p1qn1p1p/1p3n2/2p2P2/2PpP2P/1P2b1P1/PB1NQ1NK/R4R2 b - - 0 1", solution: ["Bxd2","Qxd2","Qxg3+","Kxg3","Nxe4+","Kf4","Nxd2","Rfe1","Nf6"] },
  { fen: "5k2/1brnrpb1/p1pR1np1/Pp2p1N1/4P3/1BN1B2P/1PP2P2/3R2K1 w - - 0 1", solution: ["Bxf7","Rxf7","Ne6+","Kg8","Nxc7","Bf8","Ne8","Kh7","Rxd7"] },
  { fen: "3r2k1/pb2bpp1/1pn1p2p/8/1P2q3/PQ2PN1P/1B2BPP1/3R2K1 w - - 0 1", solution: ["Bd3","Qd5","Bh7+","Kxh7","Rxd5"] },
  { fen: "2r2k2/5p2/2pp1q1p/2n1bPp1/2P5/B3Q1PP/5PB1/3R3K w - - 0 1", solution: ["f4","gxf4","gxf4","Bb2","Rxd6","Re8","Rxf6"] },
  { fen: "3r4/p5k1/1pp2bn1/4p3/2P1N1q1/1PB1Q1P1/P5K1/7R w - - 0 1", solution: ["Rh7+","Kxh7","Nxf6+","Kg7","Nxg4"] },
  { fen: "r2q1rk1/pp2n1b1/3p2pp/1b1Pp1B1/1P2N3/1Q4PP/P4PB1/R1R3K1 w - - 0 1", solution: ["Nxd6","hxg5","Nxb5"] },
  { fen: "2r3k1/pq2n1b1/4prN1/1pPbN1p1/3P2P1/8/P6Q/1B2RRK1 b - - 0 1", solution: ["Rxg6","Qh5","Rh6","Qf7+","Kh8"] },
  { fen: "5r1k/p5p1/1p3n1p/1Pp5/2RPp3/P3P2P/2Q3PK/2N1q3 b - - 0 1", solution: ["Ng4+","hxg4","Rf1"] },
  { fen: "2brrbk1/3n3p/pp1Pp1p1/5p2/PqP2P2/2N2B2/1B2Q1PP/3R1R1K w - - 0 1", solution: ["Nd5","exd5","Bxd5+"] },
  { fen: "1r5k/6p1/p1pQ1p1p/1q6/1n2N3/1P6/1KP2PPP/3R4 w - - 0 1", solution: ["Nxf6","gxf6","Qxf6+","Kg8","Rd7"] },
  { fen: "4r1k1/pQ4pp/2r5/1bq2p1n/2p1P3/P1P2P2/3BB1PP/R3R2K w - - 0 1", solution: ["Be3","Qe5","f4"] },
  { fen: "r3kb1r/1bp1n2p/p3qp2/1p2p1p1/4P2N/1PN1BQ2/1PP2PPP/R2R2K1 w kq - 0 1", solution: ["Nxb5","axb5","Qh5+","Qf7","Rxa8+","Bxa8","Rd8+","Kxd8","Qxf7","gxh4"] },
  { fen: "4N2k/4B3/6pp/pp3p2/2bb1PP1/P1n2K2/2B4P/8 b - - 0 1", solution: ["Bd5+","Kg3","Ne2+","Kh3","Nxf4+","Kg3","Ne2+","Kh3","Ng1+","Kg3","f4+","Kxf4","Ne2#"] },
  { fen: "r4r1k/pb2Nppp/1p3n2/q3n3/N3p2R/1B2P3/PP3PPP/R3Q1K1 b - - 0 1", solution: ["Nf3+","gxf3","Qg5+","Kh1","Qxh4"] },
  { fen: "4rr1k/5p2/p2p3q/1p1n1PRP/2p1pQ2/2P5/PPB2PR1/7K w - - 0 1", solution: ["Rg8+","Kh7","R2g7+","Qxg7","Rxg7+","Kxg7","f6+","Nxf6","Qg5+","Kh7","Qxf6","Re5","Bxe4+"] },
  { fen: "1n3r2/r4p1k/p2R2p1/2p5/1p2q3/1QB1P3/PP3P2/2K3R1 w - - 0 1", solution: ["Qc4","Qxc4","Rh1+","Kg8","Rh8#"] },
  { fen: "1k1r4/2q2p2/Q3pPP1/8/Pb1pP3/1p1P4/8/1KBR4 w - - 0 1", solution: ["Bf4","Qxf4","Qb6+","Kc8","Qxb4"] },
  { fen: "1n3N1k/r4p2/2pR2pp/1pq1p3/6QP/8/PPp2PP1/3R2K1 w - - 0 1", solution: ["Nxg6+","fxg6","Rd8+","Kg7","Rg8+","Kxg8","Qxg6+","Rg7","Rd8+","Qf8","Rxf8+","Kxf8","Qxc2","Kg8","Qc5"] },
  { fen: "r1b1r1k1/pp3ppp/3b1q2/3Q2N1/2B5/6K1/PPP3PP/R1B2R2 w - - 0 1", solution: ["Rf4","Be6","Nxe6","Rxe6","Qxd6","Qg6+","Rg4","Re3+","Bxe3","Qxd6+"] },
  { fen: "4r1k1/pb1q1r1p/2np2p1/2pN1pB1/2P1nP2/P1P2B2/6PP/1R1QR1K1 w - - 0 1", solution: ["Rxe4","Rxe4","Bxe4","fxe4","Nf6+","Rxf6","Bxf6"] }
]

const PALOMITA_15 = [
  { fen: "rn3rk1/pb3ppp/1p2qb2/3p4/3p4/2NN2P1/PP2PPBP/2RQ1RK1 w - - 0 1", solution: ["Nxd5","Bxd5","Nf4","Qd6"] },
  { fen: "2kr1bnr/pppq1ppp/2n5/4P3/2Pp4/1Q3NPb/PP2PPBP/RNB2RK1 w - - 0 1", solution: ["e6","Bxe6","Ne5","Qd6","Nxc6","bxc6"] },
  { fen: "r1r2bk1/p4ppp/1pq5/3R1N2/n1P5/4R3/PB2QPPP/6K1 w - - 0 1", solution: ["Bxg7","Qxd5","Nh6+","Kxg7","Qg4+","Kf6","Ng8#"] },
  { fen: "3rr1k1/p4pb1/1p4p1/3p1nq1/3P1NPp/1QR1P2P/PP1B1K2/6R1 b - - 0 1", solution: ["Nxe3","Bxe3","Rxe3","Rxe3","Qxf4+","Ke2","Qh2+","Kf1","Bxd4"] },
  { fen: "5rk1/1prnqpp1/p3p2p/P2nN3/3P4/1B5P/1P2QPP1/R2R2K1 w - - 0 1", solution: ["Ng6","fxg6","Bxd5","Rf6","Rac1"] },
  { fen: "6k1/p3r1p1/5p2/3P2p1/1P6/8/p4PPP/2R2K2 b - - 0 1", solution: ["Rc7","Rd1","Rc2","d6","Rd2","Rc1","Kf7"] },
  { fen: "3r1rk1/1R3pp1/4q2p/8/8/2pBPRP1/1bQ1P2P/6K1 b - - 0 1", solution: ["Rxd3","exd3","Qd5","Rxb2","cxb2","Rf1","Qe5","e4","Ra8","Qb3","Ra1","Kg2","Rc1","Qxf7+","Kh7","Rf5","Qd6","e5"] },
  { fen: "5nr1/pp3k2/4ppq1/2B1b3/P5Pp/1B6/1P4P1/2RQ2K1 w - - 0 1", solution: ["Bxe6+","Kxe6","Qb3+","Kd7","Qxb7+","Ke6","Rd1","Qxg4","Qd5+"] },
  { fen: "r6r/1p1qkp2/p2p1pb1/b1pP3p/4N3/P3P1N1/1P3PPP/R2Q1RK1 w - - 0 1", solution: ["b4","h4","bxa5","hxg3","Nxg3"] },
  { fen: "7k/1b4q1/pp4r1/2p1p3/P1Q1N3/6R1/1P4PP/6K1 w - - 0 1", solution: ["Ng5","Bc8","Qe4"] },
  { fen: "5k2/pp4p1/4pp2/1P6/7p/P3P1P1/4KP1b/2B5 w - - 0 1", solution: ["Kf3","Ke7","Kg2","hxg3","fxg3","Bxg3","Kxg3","Kd6","a4","Kd5","Ba3","Ke4"] },
  { fen: "5k2/pp4p1/4pp2/1P6/7p/P3P1P1/4KP1b/2B5 w - - 0 1", solution: ["Kf3","h3","Kg4","Bg1","Kxh3","Bxf2","Bd2"] },
  { fen: "5k2/3b2p1/1p4qp/p1pPp1p1/P1P1Pn2/2P5/2Q3PP/3BB1K1 b - - 0 1", solution: ["Bxa4"] },
  { fen: "1r2k2r/2pq2p1/b2p4/pNpQP1Pp/3p1P2/6P1/PPP5/2KR3R w k - 0 1", solution: ["Rxh5","Rf8","a4"] },
  { fen: "r4k2/ppr2p1p/4PQ2/2bp4/7P/8/qPP3P1/2KR1R2 w - - 0 1", solution: ["e7+","Kg8","Qxf7+","Kh8","e8=Q+","Rxe8","Qxe8+","Kg7","Qe5+","Kg8","Qg5+"] },
  { fen: "br1qr1k1/3n1p1p/3p2p1/1pnPp1b1/4P3/R1P1B2P/2BNQPP1/R4NK1 w - - 0 1", solution: ["Rxa8","Rxa8","Rxa8","Qxa8","Bxg5"] },
  { fen: "1rbq1rk1/p3ppbp/1p1p1np1/8/2PQP3/2N3P1/PP3PBP/1RB2RK1 b - - 0 1", solution: ["Nxe4","Qxe4","Bxc3","Bg5","Be5"] },
  { fen: "2r3k1/4bppp/1r2p3/qb6/5B2/2N3R1/PP4PP/2R1Q2K w - - 0 1", solution: ["Bc7","Rxc7","Qe5","Kf8","Qxc7"] },
  { fen: "4k3/1p3p2/p2pbp2/4p1b1/1P2Pr2/8/1PP2PB1/3RKR2 b - - 0 1", solution: ["Bh3","Bh1"] },
  { fen: "r5k1/1Q3p2/r2p4/P1pP1qpp/2N2b2/2PP4/5R1P/6RK w - - 0 1", solution: ["Nxd6","Rxd6","Qxa8+"] },
  { fen: "3q2kr/n1pbR1b1/p6p/P2P4/2P2p2/2NB1N2/2K2P2/Q7 w - - 0 1", solution: ["Rxg7+","Kxg7","Ne4+"] },
  { fen: "3r4/2qrbbk1/5p1p/pp1P1Pp1/6P1/P1BR3P/1P2R1B1/3Q3K w - - 0 1", solution: ["Rxe7","Rxe7","d6","Qc4","b3"] },
  { fen: "r4bk1/2Rnrppp/2p5/2qpP3/5B2/2N1P2P/2Q2PP1/3R2K1 w - - 0 1", solution: ["Rxd5","cxd5","Rxc5","Nxc5","Nxd5","Rea7","Bg5","Ra1+","Kh2","R8a2","Qf5","Ne6","Bh4","Rf1","f4","Rc1","Qg4","Rc4","Nf6+","Kh8","Qh5"] },
  { fen: "3r1bk1/1pq2p1p/6p1/3nN3/1P6/2P2QPP/5PB1/1R4K1 w - - 0 1", solution: ["Nxf7","Qxf7","Rd1"] },
  { fen: "3qr2k/1b4pp/p3Qp2/1p4b1/2pPn3/P5B1/NP3PPP/3R1RK1 w - - 0 1", solution: ["Bc7","Qa8","Qh3","Re7"] },
  { fen: "4r1kb/1b1p1p1p/3Pr1pB/ppqnP2P/2p5/P4N2/1P3PP1/1BQRR1K1 w - - 0 1", solution: ["Bf5","gxf5","Qg5+","Rg6","hxg6"] },
  { fen: "3r1bk1/1b2qp2/4n1p1/2r1P2p/N2p4/Q4NP1/1R3PBP/3R2K1 b - - 0 1", solution: ["Rc1","Qd3","Qa3","Qf1","Rxd1","Qxd1","Bc6"] },
  { fen: "2rq1r2/3n1pk1/p2Pp2p/1p4p1/2p3P1/2N1PP2/PPQ2P2/2KR3R w - - 0 1", solution: ["Rxh6","Kxh6","Rh1+","Kg7","Qh7+","Kf6","f4"] },
  { fen: "2r3k1/p4pp1/bp5p/3p4/3N4/4PPPq/PP1Q3P/4K1R1 b - - 0 1", solution: ["Rc1+","Qxc1","Qxh2","Rf1","Qxg3+","Rf2","Qg1+"] },
  { fen: "r1b1r1k1/1p3pp1/2p4p/3p4/1R5Q/4B1P1/PPq2PP1/R5K1 b - - 0 1", solution: ["Rxa2","Rxa2","Qb1+","Kh2","Qxa2","Bxh6","Qb1"] },
  { fen: "2r4k/p2b1R1p/1p2p3/2qpP3/3N4/P5Q1/6rP/K4R2 w - - 0 1", solution: ["Rxh7+","Kxh7","Rf7+","Kh6","Rf6+","Kh7","Qh3+","Kg7","Qxg2+","Kh7","Qg6+"] },
  { fen: "r5k1/2p3bp/4n1p1/1Ppq1p2/4p3/1N2P2P/2Q2PPB/3R2K1 b - - 0 1", solution: ["Ra2","Rxd5","Rxc2"] },
  { fen: "r2n1rk1/pq2n1pp/1p2p3/3pPpN1/1B1P4/P5Q1/2P2PPP/R4RK1 w - - 0 1", solution: ["Nxh7","Kxh7","Qh4+","Kg8","Bxe7"] },
  { fen: "r7/p3N1pk/7p/1p1pN2P/1P2r3/P2K3b/6R1/5R2 w - - 0 1", solution: ["Rxg7+","Kxg7","Rf7+","Kh8","N5g6#"] },
  { fen: "2r3k1/1b1r4/p4p1p/1p2q1p1/1B1nP3/R2PN2P/1RP2QP1/7K b - - 0 1", solution: ["Nf3","Qxf3","Qxb2"] },
  { fen: "r5k1/1bp1q1pp/p2p4/1p2n3/5B2/1P3P2/1PP2P1P/R2QR1K1 b - - 0 1", solution: ["Nxf3+","Qxf3","Qxe1+","Rxe1","Bxf3"] },
  { fen: "3qQ3/p5pk/b4rNp/2p5/5P1P/P5R1/3r2P1/4R1K1 w - - 0 1", solution: ["Nf8+","Kg8","Nd7+","Qxe8","Nxf6+"] },
  { fen: "1rr2b1k/1q1b1pp1/4p2p/3pP3/p2N1B2/1PP3R1/4QPPP/R5K1 w - - 0 1", solution: ["Bxh6","gxh6","Qg4"] },
  { fen: "3b2nr/6pp/ppk1bp2/2p1P3/4N3/1N2BP2/1PP3PP/R5K1 w - - 0 1", solution: ["Nbxc5","bxc5","Rxa6+","Kd7","Nxc5+"] },
  { fen: "6n1/p1q2k2/1r1p2p1/2pPbp1p/Q1P2B1P/3P2PK/P3R1B1/8 w - - 0 1", solution: ["Rxe5","dxe5","Bxe5","Qe7","d6","Rxd6","Bxd6","Qxd6","Qxa7+"] },
  { fen: "6k1/5p2/2qP3p/4n1pN/2pb4/1p3P2/1P2Q1PP/2R4K w - - 0 1", solution: ["d7","Qd6","Rxc4","Nxd7","Qd1"] },
  { fen: "5rk1/1pp3bp/3p2p1/3Pp3/1PP1N1q1/6Pn/2QN1PKP/R7 b - - 0 1", solution: ["Nxf2","Rf1","Qh3+","Kg1","Ng4"] },
  { fen: "r1bB2r1/pp3pnp/2p5/4k3/4P3/2N2P2/PPP1B2P/2KR4 w - - 0 1", solution: ["f4+","Kxf4","Bc7+","Kg5","Rg1+","Kf6","e5+","Ke7","Bd6+","Kd8","Ne4"] },
  { fen: "r1b2r2/p3q1p1/1pn1ppk1/2npP1N1/5PQ1/2N5/PPP3PP/R4RK1 w - - 0 1", solution: ["Nxd5","exd5","f5+","Bxf5","Qxf5+","Kh5","Qh7+","Kg4","h3+","Kxg5","Rf5#"] },
  { fen: "4r1kb/q1r1pp1p/p2p2p1/1p1n2B1/1P6/2P2RPP/1P2QPB1/4R1K1 w - - 0 1", solution: ["Rxf7","Nxc3","Qe6"] },
  { fen: "2r1r1k1/pp2p3/3p2p1/5P2/1q2P1p1/2N5/1PPQ4/1K5R b - - 0 1", solution: ["Rxc3","fxg6","Rh3","Qxb4","Rxh1+"] },
  { fen: "3q2k1/1r1P1pp1/8/1p2B1p1/2pQ2P1/3nR2P/1P3PK1/8 w - - 0 1", solution: ["Bc7","Nf4+","Kf1"] },
  { fen: "2rq1rk1/p2bppbp/2n3p1/1nB5/3P4/2P3P1/PQ1N2BP/R3NRK1 b - - 0 1", solution: ["Nxc3","Qxc3","Nxd4","Qb4","Ne2+","Kh1","Rxc5","Qxc5","Bxa1"] },
  { fen: "5rk1/5ppp/3p4/3B2q1/R3P1n1/2r5/P3Q1PP/5R1K w - - 0 1", solution: ["Rxf7","Rc1+","Qf1","h5","Qxc1","Qxc1+","Rf1+","Kh7","Rxc1"] },
  { fen: "r1bq1rk1/pp1pppbp/5np1/n7/3NP3/1BN1B3/PPP2PPP/R2QK2R w KQ - 0 1", solution: ["e5","Ne8","Bxf7+","Kxf7","Ne6","dxe6","Qxd8"] },
  { fen: "2r2n2/1RP3kp/p5p1/4pp2/B7/5P2/P5PP/6K1 w - - 0 1", solution: ["Bb3","a5","a4","h6","h3","g5","g4","fxg4","hxg4"] },
  { fen: "2r3k1/q4pp1/3p3p/1p1QpPb1/r3P3/1NP3PP/1P4K1/R3R3 b - - 0 1", solution: ["Ra2","Kf1","Rxc3","Rxa2","Rf3+","Ke2","Rf2+","Kd3","Qxa2"] }
]

const PALOMITA_16 = [
  { fen: "r1r3k1/2pbbpp1/p2p1qnp/np1Pp3/4P2P/2P2NP1/PP2QP2/RNBBK2R w KQ - 0 1", solution: ["Bg5","hxg5","hxg5","Qxg5","Nxg5"] },
  { fen: "1r2k2r/p5bp/4p1p1/q2pn3/1p2N1P1/6QP/PPP5/1KBR3R w k - 0 1", solution: ["Bh6","Qc7","Nd6+","Kd8","Bxg7","Qxd6","Qxe5"] },
  { fen: "r2b1nk1/p4p2/2pN2p1/1p1pPP2/1P4P1/2P3B1/P5K1/7R w - - 0 1", solution: ["e6","f6","Nf7"] },
  { fen: "r3qr1k/pp3pbp/2pn4/7Q/3pP3/2NB3P/PPP3P1/R4RK1 w - - 0 1", solution: ["Rf6","Kg8","e5","h6","Ne2"] },
  { fen: "4rk2/3Rb1p1/1B2Qp1p/pp2p3/4q3/7P/5PPK/8 w - - 0 1", solution: ["Bc5","Qf4+","g3"] },
  { fen: "r1b2b1k/1p1n1Qpp/p1n1B3/q3P1B1/8/1RN5/P1P3PP/6K1 b - - 0 1", solution: ["Qc5+","Kh1","Nf6","Bxf6","Bxe6"] },
  { fen: "8/p4k1P/1p2rp2/3Qp2r/P7/1P3P2/1KP2P2/8 w - - 0 1", solution: ["f4","f5","fxe5","Rxh7","Qd7+","Re7","Qxf5+","Ke8","f4","Kd8","e6"] },
  { fen: "3r3r/kpp3pp/p1pqbpn1/2N5/Q2PP3/5NPP/PP4P1/2R2RK1 w - - 0 1", solution: ["Nxa6","Bxh3","e5","Nxe5","dxe5","fxe5","Nc5+","Kb8","gxh3","e4","Nxe4","Qe7","Rc3","b5","Qc2"] },
  { fen: "2nrkb2/5p2/1pr1p1pp/p1p1P3/P1N1NPP1/1RP4R/1P2K2P/8 w - - 0 1", solution: ["Nxa5","Rc7","Nc4","Rc6","a5","bxa5","Nf6+"] },
  { fen: "2rq1rk1/pb2npp1/1p1p1b1p/2p1pP1Q/2B1P2P/P1NP4/1PP3P1/R1B1K2R w KQ - 0 1", solution: ["Bg5","d5","Bxf6","dxc4","Qg4"] },
  { fen: "2r1q1k1/r4p1p/b3pBp1/n3P1QP/p2p3R/P5P1/2p2PB1/R5K1 w - - 0 1", solution: ["Qh6","Qf8","Qxh7+"] },
  { fen: "2n2nk1/4qp1p/4p1pQ/pb1pP1NP/1p1PB1P1/1P4N1/P4P2/6K1 w - - 0 1", solution: ["Nxh7","Nxh7","hxg6","fxg6","Bxg6","Ng5","Nh5","Nf3+","Kg2","Nh4+","Kg3","Nxg6","Nf6+","Kf7","Qh7+"] },
  { fen: "8/8/5K2/4n3/4k1B1/7P/8/8 w - - 0 1", solution: ["Bc8","Kf4","h4","Nf3","h5","Ng5","Bf5","Nf3","h6","Ng5","Kg6","Nf3","h7","Ne5+","Kf6"] },
  { fen: "4r1k1/pp2pp1p/2bp1npQ/q2N4/4PN2/5P2/PPP5/2K4R w - - 0 1", solution: ["e5","Bxd5","exf6","exf6","Qxh7+","Kf8","Qh8+"] },
  { fen: "1r1q1rk1/pb1pbp1p/1pn3p1/2pB2N1/2P5/6P1/PP1QPP1P/R1B1K2R w KQ - 0 1", solution: ["Nxh7","Re8","Qh6","Ne5","Ng5"] },
  { fen: "2Q5/p3q1k1/Pp1p2P1/2pPr2p/2Pnpr2/2N1R3/1P3PP1/5RK1 b - - 0 1", solution: ["Nf3+","Rxf3","exf3"] },
  { fen: "2rnr1k1/1q2p1bp/3p1pp1/1p1N1P2/p1n1P1NB/P1P5/1P2Q1PP/3R1R1K w - - 0 1", solution: ["Bxf6","exf6","Ngxf6+","Bxf6","Nxf6+","Kf8","fxg6","hxg6","Qg4","Nf7","Qxg6","Nce5","Nh7+"] },
  { fen: "4rkr1/2p2p1p/pq2b3/1p3N2/8/2PR1Q2/PP4PP/5R1K w - - 0 1", solution: ["Nh6","Rg7","Rd7","Rb8","Nxf7","Bxd7","Nd8+"] },
  { fen: "1r5r/4Pkb1/q2pR3/6Pp/1p5P/4Q3/PPP5/1NK5 w - - 0 1", solution: ["e8=Q+","Rbxe8","g6+","Kg8","Rxe8+"] },
  { fen: "2r4r/4qkbR/bp2p1p1/3pP3/p2P1PB1/P5Q1/1n2NBK1/7R w - - 0 1", solution: ["f5","Rxh7","fxg6+","Kg8","gxh7+","Kh8","Nf4"] },
  { fen: "1q4r1/1p1k1p2/2p1p3/2P4p/1R1P1p2/3Q1P2/PPK1R1P1/6r1 w - - 0 1", solution: ["d5","cxd5","c6+","Kxc6","Qb5+"] },
  { fen: "1r3rk1/p1pqn1bp/2npb1p1/3N1p2/1PP1pP2/4P1PP/P2QN1BK/1RB2R2 b - - 0 1", solution: ["Na5","Nd4","Nxc4"] },
  { fen: "1r6/5pk1/2q3pp/2B1R3/3P3P/4QP2/b5PK/8 w - - 0 1", solution: ["d5","Bxd5","Qd4"] },
  { fen: "3q2k1/1R3p2/1p2p1pp/3nP3/4Q3/P2B1PP1/1P3PK1/r7 w - - 0 1", solution: ["Rxf7","Kxf7","Qxg6+","Kf8","Qxh6+"] },
  { fen: "1r4k1/3rQ1bp/6p1/1p3bN1/2pP4/2P2B2/5PPP/6K1 w - - 0 1", solution: ["Bd5+","Rxd5","Qf7+","Kh8","Qxd5","Re8","Nf7+"] },
  { fen: "r1b2r1k/1pq3pp/p1n1p3/3p4/3PnN2/3B1NP1/PP3P1P/R2QR1K1 b - - 0 1", solution: ["g5","Bxe4","gxf4","Bd3","fxg3","fxg3"] },
  { fen: "1br3k1/p4p2/2p1r3/3p1b2/3Bn1p1/1P2P1Pq/P3Q1BP/2R1NRK1 b - - 0 1", solution: ["Qxh2+","Kxh2","Nxg3","Qb5","Ne2+"] },
  { fen: "3r2k1/pb1r1pp1/1pn2q1p/3B4/6Q1/P4NP1/1P3PP1/3RR1K1 w - - 0 1", solution: ["Qxd7","Rxd7","Re8+","Kh7","Be4+"] },
  { fen: "5k2/3nqp2/b5pN/3P4/5Q2/1r1p2RP/5PPK/8 w - - 0 1", solution: ["Rxg6","Qe5","Rg8+","Ke7","d6+","Ke6","Re8+","Kd5","Rxe5+","Nxe5","d7","Rb8","Nxf7"] },
  { fen: "3rnk2/1R3p1p/2P3p1/r1b2N2/1p6/6PB/5P1P/2R3K1 w - - 0 1", solution: ["Nh6","Nd6","Nxf7","Nxf7","c7","Re8","Bd7","Nd6","Rb8"] },
  { fen: "r2q2k1/1b3ppp/pp2pn2/4N3/4PQ2/1P4P1/P4PBP/2R3K1 w - - 0 1", solution: ["Nxf7","Kxf7","Rc7+","Kf8","Rxb7"] },
  { fen: "3r2k1/p4pp1/Qp3q2/3b3p/3N4/P3PPP1/1P3K2/2R5 b - - 0 1", solution: ["Bxf3","Nxf3","Qxb2+"] },
  { fen: "r2k3r/pppb1p2/3p4/3P2q1/3P4/1B1Q2Pp/PP6/4RRK1 b - - 0 1", solution: ["Bb5","Qf3","Bxf1"] },
  { fen: "2r3k1/p2q1pbp/1p2p1p1/7P/2nPBB2/2PR2Q1/r4PP1/5RK1 b - - 0 1", solution: ["f5","Bf3","e5","dxe5","Qxd3"] },
  { fen: "4r1k1/p6p/1pbp2p1/2p2pbq/1PP2P2/PBP3P1/2QRrRNP/6K1 b - - 0 1", solution: ["Re1+","Nxe1","Rxe1+","Rf1","Qf3","Rxe1","Qh1+","Kf2","Qg2+","Ke3","Qf3#"] },
  { fen: "r4r2/p1p3qk/1pPpR1pp/3P1n2/7P/2PQ2P1/P5B1/R5K1 w - - 0 1", solution: ["h5","Ne7","Rae1","Rf7","hxg6+","Nxg6","Rxg6","Qxg6","Be4"] },
  { fen: "1b2r1k1/4rpp1/p2q1n2/2Rp1BB1/Np1P4/nP4P1/5PK1/3Q3R w - - 0 1", solution: ["Rh8+","Kxh8","Qh1+","Kg8","Bxf6","Qxg3+","fxg3","Re2+","Kh3","gxf6","Kg4"] },
  { fen: "bq3rk1/3n1rb1/1p1P2p1/2p3N1/P7/1Q4P1/4RP1P/4R1K1 w - - 0 1", solution: ["Re8","Qxd6","Qxf7+","Kh8","Ne6"] },
  { fen: "r2q1rk1/1b2bppp/p3pn2/1p4B1/1n1P4/1BN2N2/PP2QPPP/3RR1K1 w - - 0 1", solution: ["d5","Nfxd5","Nxd5","Bxg5","Nxb4","Qe7","Nd5","Bxd5","Bxd5"] },
  { fen: "3rrbk1/3Rn3/p1p1R1p1/6Np/1Pp5/2B4P/1PK2P2/8 w - - 0 1", solution: ["Rdxe7","Rxe7","Rxg6+","Bg7","Bxg7","Rxg7","Rxg7+","Kxg7","Ne6+"] },
  { fen: "2r2b1k/5Q1p/p3R1p1/1pP5/8/Pq2P3/3n2PP/R5K1 b - - 0 1", solution: ["Ne4","h4","Qxe3+","Kh1","Qd4"] },
  { fen: "5r1k/1pp1p2p/pn2P1qb/6N1/3Pb3/Q7/PP1KB3/6RR w - - 0 1", solution: ["Rxh6","Qxh6","Qe3"] },
  { fen: "6k1/1bp1r1pp/1p1p2q1/pN3p1n/1nPP4/P4PPP/1P3QBK/2BR4 b - - 0 1", solution: ["Nd3","Rxd3","f4","g4","Qxd3","gxh5","Re2","Qh4","Rxg2+","Kxg2","Qxf3+","Kh2","Qg2#"] },
  { fen: "4k2r/1r3ppp/Qnq1p3/4p3/1P6/R5P1/3N1P1P/R5K1 w k - 0 1", solution: ["Nc4","Rb8","Nxb6","O-O","Nc4"] },
  { fen: "3r1k1r/1b2qppp/p3p3/3nB3/B1nN4/2P5/P4PPP/R2QR1K1 w - - 0 1", solution: ["Bxg7+","Kxg7","Nf5+","exf5","Rxe7","Nxe7","Qe2"] },
  { fen: "8/2R3p1/1Q2ppkr/3pP2p/3P3n/5P1P/5P1K/2Bq4 w - - 0 1", solution: ["Qb1+","Nf5","Rxg7+"] },
  { fen: "4rrk1/p1pb1ppp/1p6/n1qPB3/8/2PBR3/5PPP/3QR1K1 w - - 0 1", solution: ["Bxh7+","Kxh7","Qh5+"] },
  { fen: "5bk1/ppp3pR/7R/3prq2/4r3/2P1B3/1PP2PQ1/1K6 w - - 0 1", solution: ["Bc5","Re7","Bxe7"] },
  { fen: "4r1k1/B4pp1/5n1p/bNpp4/4n3/1P2RNPP/P4P2/5K2 b - - 0 1", solution: ["Nxg3+","Kg2","Nge4"] },
  { fen: "1r1qr1k1/6bp/3p2p1/1N1P1p1n/1p6/3Q2PP/3BPPB1/1R4K1 b - - 0 1", solution: ["Nxg3","fxg3","Qb6+","Kf1","Qxb5"] },
  { fen: "r2q1rk1/1pp3bp/n2p4/p2P1b2/1PPN4/P1NpB2P/5P2/R2QK1R1 w Q - 0 1", solution: ["Nxf5","Rxf5","Rxg7+","Kxg7","Qg4+","Kf6","Ne4+","Ke5","Ng3"] }
]

const PALOMITA_17 = [
  { fen: "1r1q2k1/R4p2/3Pb2p/4Q1p1/1p2B3/2p3PP/1P3P2/6K1 w - - 0 1", solution: ["Bh7+","Kxh7","Qxe6"] },
  { fen: "3r2k1/p4p2/3qbPp1/3pR2p/1r1P4/2N1Q3/1P5P/5R1K w - - 0 1", solution: ["Rxe6","fxe6","Qh6"] },
  { fen: "4rrk1/pb3ppp/1p6/n2p1N2/6Q1/P2B4/3B1PPP/b5K1 w - - 0 1", solution: ["Nxg7","Bxg7","Bh6"] },
  { fen: "7r/ppR2nbp/4k1p1/3Nn3/3P1B2/3q1P2/PP2Q2P/7K w - - 0 1", solution: ["Bxe5","Qxe2","Nf4+","Kf5","Rxf7+","Kg5","Nxe2"] },
  { fen: "rb3rk1/1b1q1ppp/1pn1p3/p1p1P2Q/2PpNP2/3P2PP/PP4B1/R1B1R1K1 w - - 0 1", solution: ["Nf6+","gxf6","exf6","Kh8","Be4"] },
  { fen: "2br2k1/1r3pPp/p3p3/q1bp2P1/3R3P/2N1Q3/PPP1B3/2KR4 b - - 0 1", solution: ["Qb4","b3","e5","Qxe5","Qxc3"] },
  { fen: "3r2k1/5p1p/p3b1p1/6P1/2p4P/PpP5/1P1qB3/K3RQ2 b - - 0 1", solution: ["Bh3","Qg1","Re8"] },
  { fen: "8/p4k2/1p2p1q1/1b1pPr2/6pp/PN2Q3/1P3PPP/4R1K1 b - - 0 1", solution: ["Rf3","Qc1","Rxb3"] },
  { fen: "6rk/6b1/p7/3P1Nq1/P3P2p/4Qp2/1P1r1RP1/R5K1 b - - 0 1", solution: ["Bd4","Qxg5","Bxf2+"] },
  { fen: "1rr4k/4bppp/p7/3PpP2/1q6/2NR1Q2/P5PP/4R2K b - - 0 1", solution: ["e4","Qxe4","Rxc3","Qxb4","Bxb4"] },
  { fen: "2rq1rk1/pp1b1pp1/2n1p2p/3pPPb1/3P2P1/2N1B3/PP1QB2P/R4R1K w - - 0 1", solution: ["f6","gxf6","Bxg5","fxg5","Rf6","Kg7","Raf1","Ne7","h4"] },
  { fen: "kb5r/1b1r1p2/1Q5q/PNpp4/2p5/6P1/1P3PB1/R3R1K1 w - - 0 1", solution: ["Re8","Qh2+","Kf1","Rxe8","a6"] },
  { fen: "2r5/4ppk1/1N1pb1p1/1p5p/1Pr1P2P/5P2/1KPR2P1/4R3 b - - 0 1", solution: ["Rxb4+","Ka3","Rxc2"] },
  { fen: "r3kn2/5q2/r3p2p/4Pp2/1Q3N1B/5P1P/1P6/6RK w q - 0 1", solution: ["Nh5","Qc7","Rg7","Ra1+","Kg2","Qc2+","Bf2"] },
  { fen: "2b1rnkb/1q3p1p/pBrp1PpQ/1p1Np1P1/1P2P3/P2PR3/4N2P/5RK1 w - - 0 1", solution: ["Bd8","Ne6","Ne7+","Rxe7","fxe7","Qd7","Rh3"] },
  { fen: "1rb1k3/5p1p/3qpP2/p2p1Pr1/1p1Q2p1/8/PPP3BP/1K1R3R w - - 0 1", solution: ["Bxd5","Bd7","Rhe1"] },
  { fen: "r5k1/p2n1p1p/1p2pp2/3b3N/8/P1P5/5PPP/3RK2R w K - 0 1", solution: ["c4","Bc6","Rxd7","Bxd7","Nxf6+","Kg7","Nxd7"] },
  { fen: "3r1n2/8/pNpNb3/P1P1Rpk1/3P4/8/5K2/8 w - - 0 1", solution: ["d5","cxd5","Nb7","Re8","c6","Kf6","Re1","Re7","Nc5"] },
  { fen: "1r4r1/1p6/p2kb1Nn/5pR1/3P4/P2B2P1/1P1K4/4R3 w - - 0 1", solution: ["Nf4","Bd7","Rh5","Ng4","Bxf5","Nf6","Rh6"] },
  { fen: "8/p1Q2pk1/4p3/P2rP1p1/3b1PP1/5K2/8/8 w - - 0 1", solution: ["f5","Bxe5","Qb7","Rd6","fxe6","Rxe6","Qxa7"] },
  { fen: "4kr2/2qr1p2/p3p1p1/3b3p/5Q1P/1P3P2/1KP1N1P1/3RR3 w - - 0 1", solution: ["Rxd5","exd5","Nd4+","Kd8","Ne6+","fxe6","Qxf8#"] },
  { fen: "8/5p1p/2R5/1P1r1kp1/2K5/3p4/P4PPP/8 w - - 0 1", solution: ["Kxd5","d2","g4+"] },
  { fen: "5rk1/pp1R1pp1/7p/4r3/6P1/P3PQ2/1P2KPq1/2R5 b - - 0 1", solution: ["Rxe3+","Qxe3","Qxg4+","Kf1","Qxd7"] },
  { fen: "7r/2r1k2p/3Rbq1Q/2p2p1B/4p3/2P5/1P3P1P/3R2K1 w - - 0 1", solution: ["Rxe6+"] },
  { fen: "r1bq1rk1/2b2ppp/p4n2/3p1N2/1Pp5/2Q1PN2/P3BPPP/R2R2K1 w - - 0 1", solution: ["Rxd5","Qe8","Bxc4"] },
  { fen: "2B4k/6pp/pnq3b1/3p2P1/1p1r4/6Q1/PPP4P/2KRR3 w - - 0 1", solution: ["Bf5","Bxf5","Qc7","Rxd1+","Kxd1"] },
  { fen: "4n3/1b2nk2/1p1p1p1p/pP1p1PpN/P2PN1P1/1B2P2P/5K2/8 w - - 0 1", solution: ["Nhxf6","Nxf6","Nxd6+","Kf8","Nxb7"] },
  { fen: "5k2/3b2pp/1p1r1p2/1Rbp4/P7/6PP/1P3PB1/3R2K1 w - - 0 1", solution: ["b4","Bxb5","bxc5","Bxa4","Ra1","bxc5","Rxa4"] },
  { fen: "5rrk/1bq1n2p/p2pPpp1/1p2pN1N/2p1P1Q1/2P4R/PP3PPP/R5K1 w - - 0 1", solution: ["Nxf6","Nxf5","Rxh7+","Qxh7","Nxh7","Kxh7","exf5"] },
  { fen: "3r1r1k/p3bp1p/1pp2p2/5P1Q/3q1P2/1PN2RRP/1P4P1/7K w - - 0 1", solution: ["Rg4","Bc5","Qxh7+"] },
  { fen: "r1b2rk1/p2n1qpp/p2Pp3/2p2pP1/N1p2N2/8/PP3PP1/R2Q1RK1 w - - 0 1", solution: ["Nxe6","Qxe6","Re1","Qxe1+","Qxe1"] },
  { fen: "r5rk/1p2q2p/p1ppnp1B/P1b1p2B/4P3/2P2QP1/1P3P1P/3R1R1K w - - 0 1", solution: ["b4","Ba7","Rxd6","Qxd6","Qxf6+","Rg7","Bxg7+","Nxg7","Qxd6"] },
  { fen: "2r3k1/5pp1/p1p3p1/P3Pq2/2Q3P1/3nB2P/1r3P2/2R1R1K1 b - - 0 1", solution: ["Qf3","Qxd3","Rxf2","Bxf2","Qxd3"] },
  { fen: "3r4/R2n3p/3Pnbk1/4pN2/2p5/2N1B3/6PP/6K1 w - - 0 1", solution: ["Ne7+","Kf7","Nc6","Rc8","Rxd7+","Ke8","Nxe5","Bxe5","Re7+","Kd8","Bb6+"] },
  { fen: "4r1kb/p4p2/1p3Pb1/4B3/2p4R/2Pr1BR1/6PP/6K1 w - - 0 1", solution: ["Rxg6+","fxg6","Rxh8+","Kf7","Rh7+"] },
  { fen: "r3rbk1/pp3ppp/5p2/q1pP1N1Q/2P2P2/1P6/PB4PP/5RK1 w - - 0 1", solution: ["Nh6+","gxh6","Qg4+"] },
  { fen: "4r1k1/p2qBp1p/3P2p1/2n5/1p1N3Q/2bb2NP/P4PP1/3R2K1 w - - 0 1", solution: ["Nh5","Bxd4","Qxd4","gxh5","Qxc5"] },
  { fen: "r1b1r1k1/1p3ppp/p1p4q/3p4/N2P3n/3BP2P/PP2QPP1/2R2RK1 b - - 0 1", solution: ["Nxg2","Kxg2","Bxh3+","Kg3","Re6","f4","g5"] },
  { fen: "br4k1/p1q2p2/4nnp1/2P1N3/P2R3p/4N1P1/QB2PP1P/6K1 b - - 0 1", solution: ["Nxd4"] },
  { fen: "2rn2k1/3b1p1N/3p1Qp1/3Pp3/1q2P3/2p1R1NP/5PP1/6K1 w - - 0 1", solution: ["Nh5","gxh5","Qh6","f6","Qg6+","Kh8","Nxf6"] },
  { fen: "1k1rq3/pppb4/7r/1BRPnp1p/Q1N3pP/4P1P1/PR4PK/8 w - - 0 1", solution: ["Bxd7","Nxd7","Rxb7+","Kxb7","Rxc7+","Kxc7","Qxa7+","Kc8","d6"] },
  { fen: "r1b1r1k1/1p2qppp/p1p5/3p4/PP1P3n/3BP3/3QNPPP/1R3RK1 b - - 0 1", solution: ["Bh3","Qc2","Bxg2"] },
  { fen: "8/5Rp1/p1r4k/1p5n/4p1KP/4N3/PP2PP2/8 w - - 0 1", solution: ["Nf5+","Kg6","Rxg7+"] },
  { fen: "r6r/pp3kpp/n1p1bqn1/4pp2/2P5/B4PP1/PP1QBN1P/2KR1R2 w - - 0 1", solution: ["Ne4","fxe4","fxe4","Nf4","gxf4","Rhd8","Bd6"] },
  { fen: "rn3rk1/1q2ppbp/p3b1p1/1pPN4/4P3/4PN2/PPQ1B1PP/R4RK1 w - - 0 1", solution: ["c6","Qa7","c7","Bxd5","c8=Q"] },
  { fen: "r1r2bk1/1p1q3p/1P2p1p1/2P1p3/pB1p4/Qn1P2PP/2R2PB1/3R2K1 w - - 0 1", solution: ["c6","bxc6","Bxf8","Rxf8","Bxc6","Qd8","Bxa8"] },
  { fen: "5r1k/1p6/3Nb2b/1P5p/7q/4P2P/1R2QP2/rB2K2R b K - 0 1", solution: ["Ba2","O-O","Bd5","Bg6","Qg5+"] },
  { fen: "r3n1k1/pR4p1/3p4/1NpPp1Qp/2P1q2P/P7/6PK/8 w - - 0 1", solution: ["Nxd6","Qf4+","Qxf4","exf4"] },
  { fen: "rn3Bk1/pp5p/2p3p1/8/6NP/2P5/P2br1P1/3R1R1K w - - 0 1", solution: ["Rxd2","Rxd2","Nh6+"] },
  { fen: "r4r1k/pR3pp1/3p3p/8/3bQR2/6P1/P2BqP1P/6K1 b - - 0 1", solution: ["Bxf2+","Kg2","Be3+"] },
  { fen: "1r2r3/3b3k/2p1ppnp/p2p3B/3P1P1P/P3RN2/1P3P2/1K2R3 w - - 0 1", solution: ["f5","exf5","Rg1","Nf4","Bxe8"] }
]

const PALOMITA_18 = [
  { fen: "4k3/p4p2/1P2p2p/8/2pq3P/2Nr2r1/1P1nQPP1/R2R2K1 b - - 0 1", solution: ["Rxg2+","Kxg2","Qg7+","Kh2","Nf3+","Qxf3","Rxf3"] },
  { fen: "3rr3/5pk1/p2q2p1/PbnNp3/8/1B3Q1P/5PP1/2R1R1K1 w - - 0 1", solution: ["Rxc5","Qxc5","Qf6+","Kg8","Ne3"] },
  { fen: "6k1/3b1q2/1pNpNnnb/3Pp3/4P3/r4BB1/P1R3K1/7Q b - - 0 1", solution: ["Nxd5","Rf2","Bxc6","Qxh6","Qxe6","exd5","Bxd5","Bxd5","Qxd5+","Kh2"] },
  { fen: "r3r1k1/pp1q1pp1/5n1p/b2pn3/3Nb3/PP2B1PP/2P1NPBK/R2Q1R2 b - - 0 1", solution: ["Neg4+","hxg4","Nxg4+","Kg1","Bxg2","Kxg2","Rxe3","Nf4","Rd8","Rh1","Re4","Rc1","Nxf2"] },
  { fen: "3q1rk1/4pp2/p2bb1p1/1pBN1n1p/1P6/4P1PP/P3QPB1/3R2K1 w - - 0 1", solution: ["e4","Ng7","Nxe7+","Bxe7","Rxd8"] },
  { fen: "2k1r3/pp3pp1/2p3b1/6P1/P1QRPq2/2N2p2/1P6/3K1RBr b - - 0 1", solution: ["f2","Bxf2","Qxf2","Rxh1","Qf3+","Kc2","Qxh1"] },
  { fen: "r1q2rk1/1p2n1pb/1ppp3p/2n5/P1PNp1Q1/1P2P1PP/1B3PB1/R3R1K1 w - - 0 1", solution: ["Nxc6","Qxg4","Nxe7+","Kf7","hxg4","Kxe7","Bxg7"] },
  { fen: "2r1k3/5pbp/p3P1p1/1pB5/1K6/1N1B2n1/PqP5/R3Q3 b - - 0 1", solution: ["Bc3+","Qxc3","a5+","Kxb5","Qxc3"] },
  { fen: "4q2k/5p1p/p4p2/1p2bN2/2p1P3/P5P1/1P1Q1P1P/6K1 w - - 0 1", solution: ["Qh6","Qg8","f4","Bxb2","e5","Qg6","Qf8+","Qg8","Qe7","Qg6","Qd8+"] },
  { fen: "r7/4B1bk/2qP1np1/5b1p/2p2P2/2P1R2P/P2Q2P1/4R2K w - - 0 1", solution: ["Bxf6","Bxf6","Re7+","Kh6","Rf7","Bh4","Qd4","Rg8","Qa7","Rh8","Ree7","g5","Rf6+","Bg6","Rxg6+","Kxg6","Re6+","Kf5","Qf7#"] },
  { fen: "3rr3/pkp3pp/1pb2P2/3N4/2P1N3/bP6/P2R1PPP/4R1K1 b - - 0 1", solution: ["Bb4","f7","Rxe4","Rxe4","Bxd2","Re7","Bxd5","Re8","Bxf7","Rxd8"] },
  { fen: "r4rk1/1pq2ppp/p1n5/3RbbNQ/P1B1p3/1P2P3/1B3PP1/R6K w - - 0 1", solution: ["Nxf7","Rxf7","Qxf5","Rxf5","Rd8#"] },
  { fen: "3r2k1/p1r1np2/1qp1p1p1/p1R1P1Pp/3PP2P/P3B3/1PQ5/1K1R4 w - - 0 1", solution: ["d5","exd5","Rcxd5","Qxe3","Rxd8+","Kg7","Qd3"] },
  { fen: "r1b1r1k1/1pBn1pp1/2p3np/2q5/p2NP3/2P5/B2Q1PPP/3RR1K1 w - - 0 1", solution: ["Bxf7+","Kxf7","Qa2+","Kf8","Ne6+","Rxe6","Qxe6","Ne7","Re3","Ke8","Rf3","Qh5","Bd6"] },
  { fen: "3rk3/p5p1/2pqP3/1pbr1pB1/6pP/n1PB2R1/P3Q1K1/3R4 w - - 0 1", solution: ["Bxf5","Rxd1","Bg6+","Kf8","e7+","Qxe7","Bxe7+","Bxe7","Bd3"] },
  { fen: "2r1k1r1/pq3pP1/3Rp3/1Pn4Q/2p5/2P3P1/5P1P/R5K1 w - - 0 1", solution: ["Rc6","Rxc6","bxc6","Qxc6","Qh8","Rxh8","gxh8=Q+"] },
  { fen: "2r1q1k1/5pp1/1bN1p2p/1p3n2/2n5/5QP1/P4PBP/B2R2K1 b - - 0 1", solution: ["Qf8"] },
  { fen: "r5k1/pp4pp/6q1/2pp4/2bbNPn1/5BP1/PPQB2KP/4R3 b - - 0 1", solution: ["Nf2","Be3","Nd3","Re2","Nb4"] },
  { fen: "8/1b1nkp1p/4pq2/1B6/PP1p1pQ1/2r2N2/5PPP/4R1K1 w - - 0 1", solution: ["Nd2"] },
  { fen: "4r1k1/pp1q1pp1/2p2n1p/2P4r/1PB1pB2/7b/P1Q1N1P1/R3R1K1 b - - 0 1", solution: ["Bxg2","Ng3","Bf3","Qb3","Rh4","Bd6","Qh3","Bxf7+","Kh7","Qb2","Ng4"] },
  { fen: "r3r1k1/1Q4p1/p2B3p/3pP3/2q2pPP/P2n1N2/1P3PK1/7R b - - 0 1", solution: ["Nxf2","Kxf2","Qc2+","Kg1","Qd1+","Kf2","Qxh1"] },
  { fen: "rq2r1k1/2p2ppp/b1R5/P2Qp3/4P3/3pB2P/1P1NnPP1/R6K w - - 0 1", solution: ["Rxa6","Rxa6","Qxd3","Qxb2","Rb1","Rd6","Qxe2","Qa2","Qb5","c6","Qb2"] },
  { fen: "r2rkq2/3n1p2/pp1npp1p/2p4N/2P2QPP/P1NPP3/1B6/5RK1 w q - 0 1", solution: ["Nd5","exd5","Bxf6"] },
  { fen: "6k1/1R3b2/2q1pp2/3n3p/7p/8/3B1PP1/1Q4K1 w - - 0 1", solution: ["Bh6","Nc7","Qb4","Kh7","Qf8"] },
  { fen: "4rb2/5p1k/7B/1p1b1P2/6Q1/1P6/2r1p1PP/3R1R1K w - - 0 1", solution: ["Rg1","Bxh6","Rde1"] },
  { fen: "1r1r2k1/pp2ppb1/1n4pp/3bP3/2qNR2N/B5P1/P4QBP/5RK1 w - - 0 1", solution: ["Ne6","Bxe6","Rxc4"] },
  { fen: "r4r1k/ppb1q1pp/4b3/2p1p3/4Qn2/2P1NN1P/PP3PPK/3RRB2 b - - 0 1", solution: ["Nxh3","gxh3","Rxf3","Qxf3","e4+"] },
  { fen: "4r1k1/1p1nppbR/3p2p1/3P4/2P3P1/1P2BB1R/q3QPK1/r7 w - - 0 1", solution: ["Rxg7+","Kxg7","Bd4+","f6","Qe3","Nf8","Be4","Kf7","Rh8"] },
  { fen: "r2q1rk1/2p2ppp/8/1pn1P3/8/5Q2/1P3PPP/R1B2RK1 w - - 0 1", solution: ["Bg5","Rxa1","Bxd8","Rxf1+","Kxf1"] },
  { fen: "2Q5/5pbk/3p1qp1/3P4/4PP1p/3nB1PP/3N2K1/8 w - - 0 1", solution: ["e5","dxe5","Ne4","Qf5","Ng5+","Kh6","Qg8","Nxf4+","gxf4","Qc2+","Bf2"] },
  { fen: "qr4k1/2p2pp1/3p2p1/2n1p1P1/1nB1P3/2QPP2P/1P6/2B1R1K1 b - - 0 1", solution: ["Nbxd3","Bxd3","Rb3","Qc2","Rxd3","b4","Qa4"] },
  { fen: "2rr2k1/5pp1/p2p3p/qp1Pp1bP/8/5P2/PPP3P1/1K1QRB1R b - - 0 1", solution: ["Rxc2","Kxc2","Qxa2","f4","Rc8+","Kd2","Bxf4+","Ke2","Qxb2+","Kf3","Rc1"] },
  { fen: "4r1k1/p2qbp1p/1p2p1pB/4r3/4N3/P4Q1P/1P3PP1/4R1K1 w - - 0 1", solution: ["Rd1","Qc8","Nf6+","Kh8","Nxe8","Qxe8","Qc3","f6","Qc7"] },
  { fen: "1r4k1/p1R3pp/4pn2/8/3pP3/5P2/2R3PP/r1B3K1 b - - 0 1", solution: ["d3","Rc8+","Kf7","R2c7+","Kg6","Kf2","Rxc1"] },
  { fen: "1rr4k/2qb1pp1/2nppb2/7P/4PP2/PpNBB3/1P4Q1/1K4RR w - - 0 1", solution: ["e5","dxe5","Qe4","Kg8","Bc5"] },
  { fen: "1r3nk1/3b1p2/1rpq1n2/R2p2p1/P2Pp2p/1P2P3/2QNNPPP/2R2BK1 b - - 0 1", solution: ["Ng4","g3","Qf6"] },
  { fen: "2b2b1k/2r2ppp/n2p1N2/3Pr1P1/3NPQ2/2p3RP/1q3PK1/1B1R4 w - - 0 1", solution: ["g6","fxg6","Nd7","Be7","Nxe5","dxe5","Qf7","h6","Qe8+"] },
  { fen: "8/pp3rk1/1q1PQnp1/2p5/2P4r/3R1R2/PP3PP1/6K1 w - - 0 1", solution: ["Rxf6","Rxf6","Qe7+","Rf7","Qxh4"] },
  { fen: "2rr3k/pp3pp1/4p2p/2P1Bq1n/8/2P2PQ1/PP4P1/K2R3R w - - 0 1", solution: ["Rxd8+","Rxd8","Bxg7+","Kh7","Qc7","Rg8","Bd4","Rxg2","Qxb7"] },
  { fen: "2r1r1k1/1p2ppbp/p1np1np1/P2N4/R3PPq1/1N1QB3/1PP3PP/5RK1 b - - 0 1", solution: ["Nxd5","exd5","Ne5"] },
  { fen: "r1r3k1/2qn1ppp/p3p3/2bb4/1p1N2PP/4BP2/PPPRBQ2/1K5R b - - 0 1", solution: ["Bxd4","Bxd4","Bxa2+","Kxa2","Qa5+","Kb1","b3","cxb3","Qxd2"] },
  { fen: "4rnk1/pb3ppp/1p6/3r2q1/1Bp5/P4B2/1PQ2PP1/1K1R3R w - - 0 1", solution: ["Rde1"] },
  { fen: "3r1rk1/p5pp/2b5/4qp1n/1pP1P3/1P2QRPP/P2NR1B1/6K1 b - - 0 1", solution: ["Nxg3","Rxg3","f4"] },
  { fen: "5rk1/7p/p2R2p1/P1pPp3/q1N1Qr1b/2P4P/5PPK/4R3 w - - 0 1", solution: ["Rxg6+","hxg6","Qxg6+","Kh8","Rxe5","R4f5","Qh6+","Kg8","Qxh4","Rxe5","Qg3+"] },
  { fen: "r1b1kb1r/1p1n1pp1/p1n1p2p/4P3/q2NN2B/8/P1PQB1PP/1R2K2R w Kkq - 0 1", solution: ["Nxe6","g5","Nf6+"] },
  { fen: "r3r1k1/pp3pp1/8/2P1n1qp/1P6/P1Q2P2/5PBP/R3R1K1 w - - 0 1", solution: ["f4","Qxf4","Re4","Qf6","Rae1"] },
  { fen: "3B2k1/6p1/3b4/1p1p3q/3P1p2/2PQ1NPb/1P2rP1P/R5K1 b - - 0 1", solution: ["Re3","fxe3","Qxf3","Qc2","fxg3","hxg3","Qxg3+","Kh1","Bf5"] },
  { fen: "5rk1/1p3ppp/1b1p1q2/r2P4/4B1b1/P3P1P1/4NP1P/R2Q1RK1 w - - 0 1", solution: ["Bxh7+","Kxh7","Qb1+","g6","Qxb6"] },
  { fen: "5r2/1p1r2p1/p1p2bk1/8/1PPPR1P1/3KB3/1P6/5R2 w - - 0 1", solution: ["g5","Bxd4","Re6+"] },
  { fen: "3q2k1/R4p2/2pr2pp/1pQ4n/1P1pP3/3P3P/2N2PP1/6K1 w - - 0 1", solution: ["e5","Rd5","Qxc6"] },
  { fen: "5rk1/1b3r1p/4p1pb/pp1q4/2pP4/2P2PB1/P1N1Q1PP/3R1R1K b - - 0 1", solution: ["Rxf3","gxf3","Rxf3","Rxf3","Qxf3+","Qxf3","Bxf3+","Kg1","Bxd1"] }
]

const PALOMITA_19 = [
  { fen: "r1b3k1/p1q2pp1/2p4p/4b3/4r3/1P5P/PNP1BPP1/1R1Q1R1K b - - 0 1", solution: ["Be6"] },
  { fen: "r2r1nk1/ppq1bppp/2p1pn2/5N2/2PP4/3B1Q2/PP3PPP/2BRR1K1 w - - 0 1", solution: ["Qg3","Qxg3","Nxe7+","Kh8","hxg3","Re8","Nxc6"] },
  { fen: "r1b1k2r/pp3ppp/2nBpn2/2P4Q/4P3/P2Bq3/2P1N1PP/R3KR2 w Qkq - 0 1", solution: ["Rxf6","gxf6","Bf4"] },
  { fen: "3r1r1k/1q3p1p/pp6/1p2ppQ1/4Nn2/2PP4/PP3PPP/R3R1K1 b - - 0 1", solution: ["Nh3+","gxh3","Rg8"] },
  { fen: "5r1k/p4Bb1/2p3Qp/1pB1p1p1/1P2P1n1/6P1/P1nq1N1P/1R4K1 b - - 0 1", solution: ["Nce3","Bxe3","Nxe3","h4","Qe2","Qh5","g4"] },
  { fen: "3r4/2r2pkp/p3p1p1/1pNbR3/5P1q/P3Q2P/1P4PK/3R4 w - - 0 1", solution: ["Rexd5","Rxd5","Rxd5","exd5","Qe5+"] },
  { fen: "k4b1r/5p1p/2bPpqp1/p1Bp4/2pP4/2P3Q1/P4PPP/1R4K1 w - - 0 1", solution: ["d7","Bxc5","Qc7","e5","dxc5"] },
  { fen: "r1bq1rk1/p2n1pp1/1p5p/b1pp4/3P4/P2BPNB1/1P2KPPP/R2Q3R w - - 0 1", solution: ["b4","cxb4","Qb3","Nc5","dxc5"] },
  { fen: "1r4k1/3R1ppp/1qb1p3/1Pb1Q3/2P2P2/4p3/2N1B2P/2K5 w - - 0 1", solution: ["Rc7","Bf3","Bxf3","Bd6","Rc6"] },
  { fen: "6rk/2p4p/p4p1B/2b4Q/Ppq5/1n3N1P/1P4P1/4R2K w - - 0 1", solution: ["Ne5"] },
  { fen: "1rr3k1/1b2qpp1/pp1bpn1p/4n3/P1BNP3/2N1BP1P/QP4P1/R2R2K1 w - - 0 1", solution: ["Bxe6","Rd8","Nf5"] },
  { fen: "4r2r/5p2/1kp4p/p3RQp1/3R4/P5P1/qP3PP1/2K5 w - - 0 1", solution: ["Rb5+","Ka6","Rxa5+","Kb6","Qc5+"] },
  { fen: "r1b1r1k1/ppb2pp1/2nq3p/3p4/3P4/3BBN1P/PP3PP1/R2QR1K1 w - - 0 1", solution: ["Bf4"] },
  { fen: "2r2qk1/6r1/2Ppp1pQ/p1n2pP1/1p1B4/1P5P/P1P3B1/4R1K1 w - - 0 1", solution: ["Rxe6","Nxe6","Bd5","Re8","c7","Kf7","Bxg7","Qg8","Bf6"] },
  { fen: "5k2/p4p1p/Pr2p3/1nRr1p2/1R6/3N1PP1/4P1KP/8 w - - 0 1", solution: ["Rxd5","exd5","Nf4","Nc7","Rxb6","axb6","a7"] },
  { fen: "5k1r/p1nbq2r/1p1p1pp1/1PpPp1b1/2P1P1P1/P2Q1P1n/2KNN2R/3BB2R b - - 0 1", solution: ["Nf2","Bxf2","Rxh2","Rxh2","Rxh2"] },
  { fen: "5rk1/6pp/2N5/Q2p4/4q1n1/6P1/5P1P/3R2K1 b - - 0 1", solution: ["Ne3","fxe3","Qxe3+","Kg2","Rf2+","Kh3","Qh6+","Kg4","Qg6+"] },
  { fen: "5r2/1p3pk1/p1rpbn1p/b1q1p3/P3P3/1PNR1Q2/2P2PPP/R1B3K1 w - - 0 1", solution: ["Bxh6+","Kg6","Nd5","Nh7","Qg3+","Kh5","Nf6+","Nxf6","Qg5#"] },
  { fen: "4r1k1/pR3b2/5Ppp/6P1/4B1n1/7r/P3R1N1/6K1 w - - 0 1", solution: ["Bd5","Rxe2","Bxf7+","Kf8","Bxg6","Re8","Rf7+","Kg8","Rg7+","Kf8","Rh7"] },
  { fen: "2rqr1k1/R3bp1p/1n4p1/3P1b1N/3P1B2/6QP/6B1/5RK1 w - - 0 1", solution: ["Rxe7","Qxe7","Bg5","Qe2","Nf6+","Kg7","Nxe8+","Rxe8","Rxf5"] },
  { fen: "1B6/p4k1p/1p3pp1/2pN4/2P1K1PP/PP1R4/3r1r2/8 b - - 0 1", solution: ["f5+","gxf5","gxf5+","Ke5","Rxd3"] },
  { fen: "3q4/k1p2br1/1pQ5/p2pR3/P2P4/1P1B4/K1P5/8 w - - 0 1", solution: ["Re7","Qxe7","Ba6","Kxa6","Qa8#"] },
  { fen: "1n1r1k2/p1rbbppp/1p1Npn2/2P5/8/BN4P1/P3PPBP/R2R2K1 w - - 0 1", solution: ["Nb5","Rcc8","Nxa7","Rc7","cxb6"] },
  { fen: "2r1r1kb/1b2qp1p/1np2npB/1p2p3/4P3/1PP2NNP/5PP1/2QRRBK1 w - - 0 1", solution: ["Nf5","Qe6","Nd6"] },
  { fen: "3r2k1/1b3pb1/1n3npp/pBp1p1B1/P3P3/2P2NNP/5PP1/1R4K1 w - - 0 1", solution: ["Bxf6","Bxf6","Ba6","Nxa4","Rxb7"] },
  { fen: "8/p4kpp/b7/1p1qP3/2r5/1Q4P1/PPRbPP1P/5RK1 w - - 0 1", solution: ["e4","Qd4","Rd1"] },
  { fen: "5r2/pR2Npbk/3p2pp/2pP4/P4QP1/2q1P3/5PK1/8 w - - 0 1", solution: ["Nxg6","Qd3","Nxf8+"] },
  { fen: "b1r2k2/R1Nr1p2/7p/N6n/2B1PnR1/5P2/6PK/8 w - - 0 1", solution: ["Ne6+","Ke7","Rxd7+","Kxd7","Nxf4"] },
  { fen: "k7/p1r1qpnp/B2rb1p1/2ppN3/Q5P1/1R2P2P/PP3P2/1KR5 w - - 0 1", solution: ["Rxc5","Rxc5","Bb7+","Qxb7","Rxb7","Kxb7","Qb4+"] },
  { fen: "5r1k/pp4bp/1q1p2p1/3Ppb2/1P2Nr2/1Q1B1P2/P5KP/R1BR4 b - - 0 1", solution: ["Rxf3","Kxf3","Bxe4+","Kg3","Qf2+"] },
  { fen: "r4rk1/1b3pp1/p2p4/1p4qp/1P1p1n2/P2P1PN1/B1P2RPP/R2Q2K1 b - - 0 1", solution: ["h4","Ne4","Bxe4","dxe4","Nh3+","Kf1","Nxf2"] },
  { fen: "4Q3/p5pk/p1pP3p/3bN3/3Pqp2/P6P/5PP1/6K1 w - - 0 1", solution: ["Qg6+","Qxg6","Nxg6"] },
  { fen: "r3b2R/7R/r1pkn1p1/4Np2/1PPp1P2/3P1BP1/p1K5/8 w - - 0 1", solution: ["Rxe8","R8a7","c5+"] },
  { fen: "2r4k/qp5p/3p2p1/3Ppb2/NPB2p1b/1R3Pn1/5RPP/2BQ2K1 w - - 0 1", solution: ["Nc5"] },
  { fen: "2r3k1/ppP4p/6p1/5bN1/3qp3/1P2n1P1/P4QBP/2R3K1 w - - 0 1", solution: ["g4","Nc2","gxf5"] },
  { fen: "1r1Nbk2/2n4p/5P1p/1p6/p7/8/P2R1KPP/2rBR3 w - - 0 1", solution: ["f7","Bxf7","Nxf7","Kxf7","Bh5+"] },
  { fen: "4rrk1/1bpn2pp/p2bp3/1p1p1n1q/3P2N1/2P2N1P/PPB2PP1/R1BQR1K1 w - - 0 1", solution: ["Nfe5","Bxe5","Nh6+"] },
  { fen: "r4k2/2p1n1bQ/bp2B1p1/p1q5/P2p1P1P/2p1B3/1P4P1/R3R1K1 w - - 0 1", solution: ["f5","dxe3","f6"] },
  { fen: "2r4r/1b1nqkpp/p3pb2/4p2P/2pN1PQ1/P1N1B2R/1PP5/2KR4 w - - 0 1", solution: ["Nxe6","Bc6","f5","e4","Bd4","Rhg8","Nxe4","Bxe4","Qxe4","c3","b4"] },
  { fen: "5kr1/1p3p1p/2pqB3/4R1rn/p2P4/2P2Q2/PP3P2/3R3K b - - 0 1", solution: ["Nf4","Qxf4","Rh5+","Rxh5","Qxf4"] },
  { fen: "r3rbk1/1p1q2pp/5p2/pNpnP3/P2p1PP1/1P3Q1P/1P1B4/R3R2K w - - 0 1", solution: ["Nd6","Nb4","Nxe8"] },
  { fen: "2k1r2r/pp6/2p2np1/4p3/2P3P1/1P1R1P1p/PB2N2b/1K2R3 b - - 0 1", solution: ["e4","Re3","exf3","Rxf3","Ne4","Kc2","Ng5","Rf2","Be5","Bxe5","Rxe5","Rh1","Re4","Rg1","Nf3","Rh1","Ne5","Kd2"] },
  { fen: "6k1/1q3p1p/p2p2p1/4r1PP/4nQ2/2P2N2/P7/4R1K1 b - - 0 1", solution: ["Nxg5"] },
  { fen: "5rk1/p2bppb1/3p2p1/1pq2PBn/4P1Q1/1B6/P1P5/1K1R3R w - - 0 1", solution: ["Bh6","Qc3","Bxg7","Qxg7","Rdg1"] },
  { fen: "5r1B/p3kB1R/1b4p1/4pbN1/5n2/1P3K2/P7/8 b - - 0 1", solution: ["Rxh8","Rxh8","Kf6"] },
  { fen: "2r1k1r1/q4p2/pR2p3/Pb2P2p/3Pp3/7Q/2N3PP/4R1K1 w - - 0 1", solution: ["Rxe6+","Kf8","Qa3+","Kg7","Re7","Rc7","Rxc7","Qxc7","Ne3"] },
  { fen: "2r4k/N6p/3p2p1/1Q1Pb3/Pq2Pr1P/R1p2P2/1P6/1KR5 b - - 0 1", solution: ["c2+","Ka2","Qd2","Qf1","Qd4"] },
  { fen: "R6r/1p1rn1kp/2pN1pp1/2P1p3/4P3/2K4P/5PP1/1R6 w - - 0 1", solution: ["Ne8+","Kf7","Nxf6"] },
  { fen: "r1q3k1/2n1pp1p/3p2p1/2pP4/1r1bPPn1/1PN2QPP/PB4N1/1R3R1K b - - 0 1", solution: ["Ne5"] },
  { fen: "3r2k1/p4p1n/1pqB1bp1/2pR3p/2P4P/1P4Q1/P2N1PPK/8 b - - 0 1", solution: ["Bxh4","Qd3","Nf6","Be7","Qc7+"] },
  { fen: "r2q1r1k/1b1PNpbp/p2Q4/2p3N1/1pP1p2P/5P1R/PP2nP2/1K1R4 w - - 0 1", solution: ["Qxc5","Nf4","Qf5","Ng6","h5","Qxe7","hxg6"] }
]

const PALOMITA_20 = [
  { fen: "r3r1k1/pp3p2/3p1b1R/2pPnBpQ/4P3/5q2/PP2N3/1K4R1 w - - 0 1", solution: ["Rxg5+","Kf8","Rxf6","Qd3+","Kc1","Qe3+","Kd1","Qd3+","Ke1","Qb1+","Kf2"] },
  { fen: "1r4k1/8/b2pRqp1/p1pP1p2/P1P2P2/2p2Q2/5PB1/6K1 b - - 0 1", solution: ["Qxe6","dxe6","c2","Qe3","Rb1+","Kh2","c1=Q"] },
  { fen: "1r4k1/RB2rpp1/8/1R4p1/8/1PPn3P/5P2/7K w - - 0 1", solution: ["Be4","Nxf2+","Kg2","Ree8","Rxb8","Rxb8","Kxf2"] },
  { fen: "3r2k1/pp1nb1pq/2p1p1Rp/5r1P/3PN3/2PQ4/PP3P2/1KBR4 b - - 0 1", solution: ["Ne5","Qg3","Rxh5"] },
  { fen: "5n2/5kpp/3P1p2/4pN2/2b3P1/6PP/3B1K2/8 w - - 0 1", solution: ["d7","Nxd7","Nd6+","Kg6","Nxc4"] },
  { fen: "r6r/k4pp1/pq2p2p/1p1n4/3N3P/1R6/PPP1QPP1/2KR4 w - - 0 1", solution: ["Nxb5+","axb5","Rxb5","Qc6","Rdxd5","exd5","Qe7+","Ka6","Rb3"] },
  { fen: "2r1k3/3n1p2/p5B1/3PpQ2/P4P2/6Pp/2pq1B1P/2b1R1K1 b - - 0 1", solution: ["Qxe1+","Bxe1","Be3+","Kf1","c1=Q","Qxf7+","Kd8"] },
  { fen: "3r2k1/2r2pp1/3q3p/p6P/1n1pR3/1P1N1QP1/P1R2PK1/8 w - - 0 1", solution: ["Nxb4","axb4","Rxd4","Qf8","Rxd8","Qxd8","Rxc7","Qxc7","Qa8+","Kh7","Qe4+","Kg8","Qxb4"] },
  { fen: "3q4/2RnN1bk/4p1pp/1p2P3/4NP2/8/1P2QKP1/r7 w - - 0 1", solution: ["Qd3","Qxe7","Rxd7","Qh4+","Kf3","Qh5+","Kg3"] },
  { fen: "r5k1/1R1Q3p/3pNb2/p1pP2pq/2P1P3/6P1/6KP/8 w - - 0 1", solution: ["Nf4","Qh6","Qe6+","Kh8","Nh5","Rf8","Qxd6"] },
  { fen: "3rr1k1/p7/nq1p2pp/2p1bb2/2P1Np2/1N3B1P/PP1RQPP1/3R2K1 w - - 0 1", solution: ["Nxd6","Bxd6","Rxd6","Rxe2","Rxd8+","Kf7","Bxe2"] },
  { fen: "3r4/2qr1pk1/1p4p1/p1pnR3/3P3p/P4QNP/1P3PP1/4R1K1 w - - 0 1", solution: ["Nh5+","gxh5","Rg5+","Kf8","Qxh5"] },
  { fen: "r1b1r1k1/1p1n1pbp/1qpR2p1/p1n3B1/P1P1P3/1PN3PP/2Q1NPB1/3R2K1 w - - 0 1", solution: ["Nd5","Qxb3","Qxb3","Nxb3","Nc7","Re5","Nxa8","Rxg5","Rxd7","Bxd7","Rxd7"] },
  { fen: "5rk1/pp1b1p2/2q2Qp1/4P2P/6p1/4NP2/P7/5R1K w - - 0 1", solution: ["Nd5","Kh7","hxg6+","fxg6","Qe7+"] },
  { fen: "1kb1r3/1pp2pp1/p1n5/2bNP1Bp/5P2/2P4P/PK2B1P1/4R3 b - - 0 1", solution: ["Nxe5","fxe5","Rxe5","Bf4","Rxd5"] },
  { fen: "r2qr1k1/pb1p1pp1/1pnR1n1p/4pQN1/2P4P/1P2P3/PB3PP1/2K2B1R w - - 0 1", solution: ["Rxf6","Qxf6","Qh7+","Kf8","Ne4","Qe6","Ba3+"] },
  { fen: "7r/r3kp2/2bp1p2/p1q1pP1N/1pB1P2P/4b3/PPP1Q1P1/1K1R1R2 w - - 0 1", solution: ["Nxf6","Kxf6","Rxd6+","Ke7","Rxc6","Qxc6","Qxe3"] },
  { fen: "2b3k1/5ppp/4rn2/2p5/2P5/4N1P1/5PBP/3R2K1 w - - 0 1", solution: ["Bc6"] },
  { fen: "4r2r/ppq2kpp/1b2bp2/nP1p4/R7/B2B1N2/2P2PPP/3QR1K1 w - - 0 1", solution: ["Ng5+","fxg5","Qf3+","Kg8","Rxe6"] },
  { fen: "6rk/4bppp/bqn1p2B/p2nP3/Pp1N2Q1/1N6/1P3PPP/1B2R1K1 w - - 0 1", solution: ["Bxh7","Kxh7","Be3","Rh8","Nxe6"] },
  { fen: "3r4/1b4b1/1k1pR3/1P1P2pp/2P5/6P1/5P2/4R1K1 w - - 0 1", solution: ["c5+","Kxc5","Re7","Bd4","Rxb7"] },
  { fen: "3b1r1k/5q2/3p2p1/p2Np3/2P5/1P3rP1/1RQ1RPK1/8 b - - 0 1", solution: ["Rxg3+","Kxg3","Qf3+","Kh2","Kg7"] },
  { fen: "2r2rk1/pb4pp/4pb2/1p6/2pPqP2/P1B5/1PN2QPP/4RRK1 b - - 0 1", solution: ["Bh4","Rxe4","Bxf2+","Rxf2","Bxe4"] },
  { fen: "q1r2rk1/5pp1/6p1/4Rn2/3pN3/5QP1/2P1RPKP/8 b - - 0 1", solution: ["d3","Re1","dxc2"] },
  { fen: "2r1r1k1/pp3p1p/5Rp1/3N2n1/4P3/1B4Bq/PPP2Q2/6K1 w - - 0 1", solution: ["Rxf7","Nxf7","Nf6+","Kf8","Nxe8"] },
  { fen: "7k/6r1/2pN2pp/3n4/5Q2/7P/3R1PPK/4q3 w - - 0 1", solution: ["Rxd5","cxd5","Qf8+","Kh7","Ne8"] },
  { fen: "6rk/3Q3p/5pq1/8/1p1P4/6Pn/5PKN/4R3 b - - 0 1", solution: ["Nxf2","Kxf2","Qxg3+","Ke2","Qxh2+"] },
  { fen: "5k2/4rp1p/p7/1p2nPp1/2b2N2/2PB4/PKP2PPP/4R3 w - - 0 1", solution: ["Ne6+","Bxe6","Rxe5"] },
  { fen: "r2qkbnr/2pb1p1p/p1n3p1/1p2p3/4P3/1BP2N2/PP3PPP/RNBQK2R w KQkq - 0 1", solution: ["Qd5","Qf6","Nxe5","Nxe5","Qxa8+"] },
  { fen: "r3r3/pp2nkp1/2p1bp2/2Pp3p/2PB4/1B2RPPq/PP2Q2P/5RK1 w - - 0 1", solution: ["Re1","Nf5","cxd5","Nxd4","dxe6+"] },
  { fen: "6k1/p1qb1pb1/1pn1pB1p/1B2P1pP/3P4/8/P3NPP1/2Q3K1 w - - 0 1", solution: ["d5","exd5","Nd4"] },
  { fen: "5b1r/1pk2ppp/pNp1p3/4Pb2/4q3/4P3/PP2K2P/R1B1QB1R b - - 0 1", solution: ["Qg4+","Kf2","Qh4+","Ke2","Bg4+","Kd2","Bb4+"] },
  { fen: "4k3/1R1p2pp/3P1p2/2P1p3/2b5/Br3P2/1P4PP/6K1 w - - 0 1", solution: ["c6","dxc6","Bb4"] },
  { fen: "3r2k1/p2r1pp1/b4q2/P1pB4/2P1P1p1/5p1P/Q4P1K/1R4R1 b - - 0 1", solution: ["Bxc4","Qxc4","Qf4+","Rg3","Rxd5","Qxd5","Rxd5","exd5","c4"] },
  { fen: "r2q1rk1/pb3ppp/1pn1p3/4P3/1b6/2BB1N2/PP2QPPP/R4RK1 w - - 0 1", solution: ["Bxh7+","Kxh7","Qe4+","Kg8","Bxb4","Nxb4","Qxb7"] },
  { fen: "7r/p4p2/PpB1pk1p/1Pn2p2/7R/2P1KPP1/4P2P/8 w - - 0 1", solution: ["Rc4","Rb8","Rxc5","bxc5","Bb7"] },
  { fen: "3r1r1k/6bp/6p1/1R2p3/q4p2/2Bb1N1P/1Q3PP1/5RK1 w - - 0 1", solution: ["Rb7","Qc2","Qb4","Rfe8","Re1","Be2","Nxe5","Bxe5","Bxe5+","Rxe5","Qxf4","Qf5","Qh6"] },
  { fen: "8/1pp3kp/p2b2B1/3P3r/5q2/5P2/PPQ3RP/7K b - - 0 1", solution: ["Rxh2+","Rxh2","Qxf3+","Kg1","Bxh2+","Kxh2","Qf4+","Kg2","hxg6"] },
  { fen: "2bqr1k1/1p3pbp/1n4p1/3P2N1/4p3/2P3P1/3Q1PBP/2BR2K1 b - - 0 1", solution: ["e3","Qb2","Qxg5","Qxb6","e2","Re1","Qxc1","Rxc1","e1=Q+","Rxe1","Rxe1+","Bf1","Bh3"] },
  { fen: "5rk1/p7/2p3pP/3nqpN1/Q5P1/8/PP2r3/1KB2R1R b - - 0 1", solution: ["Nc3+","bxc3","Rb8+","Qb4","Rxb4+","cxb4","Qd5","h7+","Kh8","Bb2+","Rxb2+","Kxb2","Qd2+"] },
  { fen: "r4rk1/5ppp/1qp1pP2/1bRpP3/4P3/1p6/P2Q1PBP/2R3K1 b - - 0 1", solution: ["Qxc5","a4","Qxc1+","Qxc1","b2"] },
  { fen: "2rr2k1/q4pbn/2p3p1/N2nP2p/1p1P1N2/1P4PP/P2B2Q1/3R1RK1 w - - 0 1", solution: ["Nxc6","Rxc6","Nxd5","Qxd4+","Be3","Qxe5","Ne7+","Qxe7","Rxd8+","Qxd8","Qxc6"] },
  { fen: "r1bqk3/p2pppbn/1pn3p1/3N2B1/2P5/1N4P1/PP2PP2/R2QK2B w Qq - 0 1", solution: ["Bxe7","Nxe7","Nxe7","Bxb2","Rb1","Bc3+","Kf1"] },
  { fen: "6rk/2p1qr1p/3b1p1B/2p1p1p1/P1Q1P1P1/1P5P/2P1R1P1/5R1K w - - 0 1", solution: ["h4","gxh4","g5","Rg6","Ref2"] },
  { fen: "r2r3k/1p4b1/3p1n1p/3PpPp1/1Q2Pn1q/1P2BP2/P2N4/1KR2BR1 b - - 0 1", solution: ["N4xd5","Bxg5","Qxg5","Rxg5","Nxb4"] },
  { fen: "4r1k1/p1p2rb1/1pbp3p/4nqp1/2P5/1P3PB1/P1NQP2P/2RR1BK1 b - - 0 1", solution: ["Qxf3","exf3","Nxf3+","Kh1","Nxd2+"] },
  { fen: "r1r3k1/pq1n1ppp/1p2p3/1Nb5/2Q2B2/4P3/PP3PPP/2RR2K1 w - - 0 1", solution: ["Nc7","Rxc7","Bxc7","Qxc7","b4"] },
  { fen: "6k1/1b1r2p1/p4n1p/Ppq1pP2/2p1P2N/2P3PP/2Q3BK/3R4 b - - 0 1", solution: ["Bxe4","Bxe4","Rxd1","Qxd1","Nxe4","Qd8+","Kh7","Ng6","Qf2+","Kh1","Nxg3#"] },
  { fen: "3r1r2/p3npk1/1q1p2p1/1b4P1/1p1PPN2/5R1B/PP3Q2/4R1K1 w - - 0 1", solution: ["Be6","Be8","Nd5","Nxd5","Bxd5"] },
  { fen: "5rk1/1b5p/1q2p1p1/1p2P3/3RPn2/5N1P/1P3QP1/5BK1 b - - 0 1", solution: ["Nxh3+","gxh3","Rxf3","Qxf3","Qxd4+"] }
]

const PALOMITA_21 = [
  { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", solution: ["Z0"] },
  { fen: "r1b1k1r1/ppppnpq1/8/n3P2p/2B4N/5QB1/P4PP1/3RR1K1 w q - 0 1", solution: ["e6","dxe6","Bb5+","c6","Bc7","Bd7","Bxa5","Qg4","Qd3","Nd5","Re4"] },
  { fen: "r2q2k1/pp1b1rpp/1b1Q1p2/4N1B1/4R3/8/PP3PPP/4R1K1 b - - 0 1", solution: ["Bxf2+","Kh1","Be8","Nxf7","Bxf7","Qxd8+","Rxd8"] },
  { fen: "r1r5/pp1qnkpp/4Np2/3p4/8/8/PP2QPPP/2R1R1K1 w - - 0 1", solution: ["Qg4","g6","Ng5+","Ke8","Rxe7+","Kf8","Rf7+","Kg8","Rg7+","Kh8","Rxh7+","Kg8","Rg7+","Kh8","Qh4+","Kxg7","Qh7+","Kf8","Qh8+","Ke7","Qg7+","Ke8","Qg8+","Ke7","Qf7+","Kd8","Qf8+","Qe8","Nf7+","Kd7","Qd6#"] },
  { fen: "4r3/1kp5/1pb5/p2q1PB1/P1pP3p/2P4P/3Q3K/5R2 b - - 0 1", solution: ["Rg8","Re1","Qxf5","Re5","Qf3","d5","Qg3+","Kh1","Qxe5","dxc6+","Kxc6"] },
  { fen: "r1bq1k2/ppp2rbp/2np1pp1/3N4/2Q1P3/5NB1/PPP2PPP/3RR1K1 w - - 0 1", solution: ["Nxc7","Rxc7","Bxd6+","Re7","e5","fxe5","Ng5","Bh6","Qf7#"] },
  { fen: "r4rk1/1b2bppp/ppq1p3/2ppB2n/5P2/1P1BP3/P1PPQ1PP/R4RK1 w - - 0 1", solution: ["Bxh7+","Kxh7","Qxh5+","Kg8","Bxg7","Kxg7","Qg4+","Kh7","Rf3","e5","Rh3+","Qh6","Rxh6+","Kxh6","Qd7"] },
  { fen: "r5k1/6np/p2q2pB/1ppr4/3p1PP1/3P3P/PP4Q1/R3R1K1 w - - 0 1", solution: ["Re7","Ne6","Re1","Qxe7","Qxd5","Re8","f5"] },
  { fen: "1rb3k1/5rpp/p3p3/3pP2P/5PQ1/qPpB1N2/PbP4R/1K4R1 w - - 0 1", solution: ["Bg6","Re7","h6","Bc1","Bxh7+","Kf8","hxg7+","Ke8","g8=Q+","Kd7","Q4xe6+","Rxe6","Rg7+","Kc6","Nd4+","Kc5","Nxe6+","Bxe6","Rc7+","Kd4","Qg1+","Be3","Rd2+","cxd2","c3#"] },
  { fen: "5rk1/1P2qpp1/2p4p/2n1p3/2B1P3/2PP1Q1P/3K2P1/7R w - - 0 1", solution: ["Qxf7+","Qxf7","Bxf7+","Kh8","Rb1","Rb8","Be8","Rxb7","Rxb7","Nxb7","Bxc6"] },
  { fen: "r3r1k1/ppp2ppp/6q1/3P1b2/2P1B3/5P2/P1Q2P1P/R3BR1K b - - 0 1", solution: ["Rxe4","Qc3","Rh4","Rg1","Rxh2+","Kxh2","Qh5+","Kg3","Qg5+","Kh2","Qh4+","Kg2","Qh3#"] },
  { fen: "4r1k1/2q2ppp/p1pb4/3p4/1P6/1NP2PPb/P2Q1R1P/4N1K1 b - - 0 1", solution: ["Bxg3","Re2","Bxh2+","Kh1","Rxe2","Qxe2","Bd6"] },
  { fen: "r6r/1b4p1/p1p4p/1p1nq3/1b6/kPP2Q2/2KB1PPP/3R3R b - - 0 1", solution: ["Bxc3","Bxc3","Nb4+","Kb1","c5"] },
  { fen: "r1br2k1/ppp2pp1/5q1p/4p3/2N1Pn2/2PB4/P1PQ1PPP/R4RK1 b - - 0 1", solution: ["Bh3","Ne3","Bxg2","Nf5","Bxe4","Ng3","Nh3#"] },
  { fen: "r3k2r/4bp2/pp1p2np/2pPp1pn/2P1P3/P1NBBPPq/1P3Q1P/4NR1K b kq - 0 1", solution: ["Ngf4","gxf4","gxf4","Bd2","Rg8","Ng2","Bh4","Nd1","Bxf2","Rxf2"] },
  { fen: "r4rk1/1q1nbppp/p1b1pn2/1p6/1P5Q/2N1BNP1/P3PPBP/2RR2K1 w - - 0 1", solution: ["Rxd7","Bxd7","Ng5","Qb8","Nxh7","Rc8","Ng5","Bc6","Nce4","Bxe4","Rxc8+","Qxc8","Bxe4","Rb8","Bd4","Qc1+","Kg2","Rd8","Bh7+","Kf8","Bg6","Rxd4","Qh8+","Ng8","Nh7+","Ke8","Qxg8+","Kd7","Qxf7"] },
  { fen: "1br2rk1/1b2qpp1/p5n1/1p1pP1QN/3p1P1N/1B5P/PP4PK/3RR3 w - - 0 1", solution: ["Nf6+","gxf6","exf6","Bxf4+","Qxf4","Qxe1","Nxg6","Qe4","Ne7+","Kh8","Rxd4","Qh7","Qh4","Rc4","Bxc4","dxc4","Qxh7+","Kxh7","Rh4#"] },
  { fen: "r4r1k/pp4pp/2pp1q2/8/3P1nb1/4RN2/PPB2PPP/3QR1K1 b - - 0 1", solution: ["Nh3+","Kf1","Qh4","Qe2","Qh5"] },
  { fen: "2q3k1/5pb1/p5pp/1p6/3rP3/P2nP3/NP2Q1PP/3R2K1 b - - 0 1", solution: ["Nf4","exf4","Qc4","Qxc4","Rxd1+","Qf1","Bd4+","Kh1","Rxf1#"] },
  { fen: "5k2/p5p1/6p1/5p2/P1N5/2PpKP2/r3b1PP/4R3 b - - 0 1", solution: ["f4+","Kf2","Bd1+","Kf1","Bb3","Nd6","Kg8"] },
  { fen: "5q1k/pp2rpp1/2pN1n1p/3nN3/3P3R/P2Q3P/1P3PP1/6K1 w - - 0 1", solution: ["Ndxf7+","Kg8","Nh8","Rxe5","dxe5"] },
  { fen: "r1b2kB1/pp2q3/2pp1bpp/8/P3P3/1QN5/1PP3PP/5RK1 w - - 0 1", solution: ["e5","dxe5","Ne4","Bf5","Nxf6","Qxf6","g4","Kg7","Qxb7+"] },
  { fen: "3r1r2/pq2b1pk/4p3/1Pp2p2/4PN2/P4KP1/2Q2P1P/R2R4 b - - 0 1", solution: ["g5","Nxe6","Rd3+","Kg2","Qxe4+","Kf1","Rxd1+","Qxd1","Qxe6"] },
  { fen: "2rq1rk1/pb2nppp/1p2pn2/4N3/3P4/1BN2P2/PP2Q1PP/2RR2K1 w - - 0 1", solution: ["Nxf7","Rxf7","Qxe6","Qf8","Re1","Ng6","Ne4"] },
  { fen: "r1bqrnk1/p3bppn/2p4p/1p1p4/3P1BP1/2NBP2P/PPQ1NP2/2KR3R w - - 0 1", solution: ["Nxb5","cxb5","Bc7","Qd7","Bf5","Nf6","Bxd7","Bxd7","Ba5","Rac8","Nc3","b4","f3","bxc3","Bxc3"] },
  { fen: "rnb4r/p3kppp/1p2pn2/b1p5/2P2N2/P1N1P3/1P1B1PPP/R3KB1R w KQ - 0 1", solution: ["b4","cxb4","axb4","Bxb4","Ncd5+","Nxd5","Nxd5+","exd5","Bxb4+","Kf6","cxd5"] },
  { fen: "r1bq2k1/pp3pbp/1np3p1/8/PPBNr3/4P3/3B1PPP/2RQ1RK1 w - - 0 1", solution: ["Bxf7+","Kxf7","Qf3+","Bf5","Nxf5","gxf5","Qxf5+","Kg8","Qxe4","Qxd2","Qe6+","Kh8","a5","Nd5","a6"] },
  { fen: "r3r2k/6qp/8/pP1nN3/4p1P1/7P/2R5/Q4RK1 w - - 0 1", solution: ["Rf7","Qxe5","Rf8+","Kg7","Qxe5+","Rxe5","Rxa8","e3","b6","e2","Rxe2","Rxe2","b7","Rb2","b8=Q","Rxb8","Rxb8"] },
  { fen: "5r1k/2p3p1/1b1p4/4p3/1PQ1B2P/3P1P1K/1P3q1P/R7 w - - 0 1", solution: ["Qf7","Qf1+","Kg4","Qg2+","Kh5","Rg8","f4","Qe2+","Kg5","Be3","h3","Bxf4+","Kg6"] },
  { fen: "2r2rk1/1p1qbppp/p3pn2/8/1P1Nn3/P3P3/BB3PPP/R2Q1RK1 w - - 0 1", solution: ["Nxe6","Qxd1","Rfxd1","Rc2","Bxf6","Bxf6","Nxf8","Bxa1","Rxa1","Kxf8","Bd5"] },
  { fen: "r1bq2k1/pp3pbp/2P2np1/8/3N4/1QN1rP2/PP3KPP/3R1B1R b - - 0 1", solution: ["Ng4+","fxg4","Bxd4","Qd5","Qf6+","Kg1","Rd3+","Qxd4","Qxd4#"] },
  { fen: "2b2knQ/r1qr2pR/2N1p3/1p3pB1/3p2P1/2b5/PPP5/2K4R w - - 0 1", solution: ["R1h6","d3","bxc3","d2+","Kd1","Qxc6","Rf6+","Rf7","Qxg7+"] },
  { fen: "2r1kr2/p1qbbp1Q/3p4/5p2/1p1N1P2/6P1/PPP4P/K2RR3 w - - 0 1", solution: ["Rxe7+","Kxe7","Re1+","Kd8","Qh4+","f6","Qh6","Qa5","Nb3","Qd5","Qxf8+","Kc7","Qxf6"] },
  { fen: "rn3k1r/pp2bppp/2pN1n2/8/5B2/7P/PqP1QP2/3RKB1R w K - 0 1", solution: ["Qxe7+","Kxe7","Nf5+","Ke8","Nxg7+","Kf8","Bd6+","Kxg7","Rg1+","Ng4","Rxg4+","Kf6","Rf4+","Kg7"] },
  { fen: "r6r/3qP1k1/p3RnBp/3p1P2/8/1Pp3B1/P1P3PP/2KR4 w - - 0 1", solution: ["Be5","Qxe6","fxe6","Kxg6","Rf1","Nh7","Bxh8","Rxh8","Rf8","Rxf8","exf8=Q","Nxf8","e7","Kf7","exf8=Q+","Kxf8","Kd1"] },
  { fen: "5rk1/pp6/2p1q3/8/1PPbNpP1/P7/4Q1B1/2B2K2 b - - 0 1", solution: ["f3","Bxf3","Qxg4","Nf6+","Rxf6","Qe8+","Kh7","Qe7+","Qg7","Qxg7+"] },
  { fen: "1R2r1k1/5ppp/p2Q4/1p1P2P1/6KP/P3q3/1P6/8 b - - 0 1", solution: ["f5+","gxf6","h5+","Kxh5","Qf3+","Kg5","Qxf6+","Qxf6","gxf6+","Kxf6","Rxb8","Ke7","Rb7+","Ke8","Rh7","d6","Rxh4","d7","Re4+","Kd8","Kf7","Kc7","Rc4+","Kb6","Ke7"] },
  { fen: "3r2k1/R5pp/1p3pn1/3b2q1/3P4/P4QP1/BP3P2/6K1 w - - 0 1", solution: ["Ra8","Bxa2","Rxd8+","Kf7","Qc6","Ne7","Qe8+","Ke6","Rc8","Qd5","Rc3"] },
  { fen: "r3rbk1/2q2p1p/2p1p1p1/pp1nP1B1/6Q1/P2B2P1/1PP2PK1/R6R w - - 0 1", solution: ["Rxh7","Qxe5","Rxf7","Kxf7","Bxg6+","Kg8","Bxe8"] },
  { fen: "rnq1brk1/ppp2pb1/6p1/6N1/2B5/8/PPPQ1PPP/3RR1K1 w - - 0 1", solution: ["Qf4","Nd7","Rxd7","Bxd7","Bxf7+"] },
  { fen: "8/7p/p1pp1k2/P5p1/1PP5/6PP/6K1/8 b - - 0 1", solution: ["d5","cxd5","Ke5","dxc6","Kd6","Kf3","Kxc6","Kg4","Kb5","Kxg5","Kxb4","Kh6","Kxa5","Kxh7","Kb4","g4","a5","g5","a4","g6","a3","g7","a2","g8=Q","a1=Q"] },
  { fen: "r1b2rk1/1pq1bppp/p3p3/2n1n1B1/3N4/3B1N2/PPP1Q1PP/R4R1K w - - 0 1", solution: ["Bxe7","Nxf3","Rxf3","Qxe7","Bxh7+","Kxh7","Rh3+","Kg8","Nf5","Qg5","Qh5"] },
  { fen: "3r1rk1/pp3pp1/2p1p2P/q3n1p1/2P5/6N1/PP1RQPP1/1K5R w - - 0 1", solution: ["Rd5","Rxd5","cxd5","Qxd5","hxg7","Kxg7","Nh5+","Kg6","Nf4+","gxf4","Qh5+","Kf6","Qh4+","Kf5","Qh5+","Ke4","Qe2+"] },
  { fen: "5r2/3bqpk1/2n1p1pr/1p1pP1N1/p1nP1NQp/P4R1P/1P2RPP1/1B4K1 w - - 0 1", solution: ["Nxf7","Rxf7","Nxg6","Rxg6","Qxg6+","Kf8","Rxf7+","Qxf7","Qh6+","Qg7","Qxh4"] },
  { fen: "r2qr1k1/pp1b1pp1/3n3p/3p1P1N/3P1R2/P1PB4/5QPP/R5K1 w - - 0 1", solution: ["Nxg7","Ne4","Bxe4","Rxe4","f6"] },
  { fen: "5b1Q/2q1kp1r/p1P2n2/1p2p3/1P3p2/P2R1Bp1/2P3P1/1K2R3 w - - 0 1", solution: ["Rd7+","Qxd7","Rxe5+","Qe6","Rxe6+","fxe6","c7","Rxh8","c8=Q"] },
  { fen: "r2qk2r/1p1n1ppp/2pbp3/p3Nb2/3P4/1B6/PPPBQPPP/R3K2R w KQkq - 0 1", solution: ["Nxf7","Kxf7","g4","Qf6","gxf5"] },
  { fen: "8/1r2n1k1/2p2pp1/1q1pN3/3P2P1/4PQ2/5PK1/2R5 w - - 0 1", solution: ["g5","Nf5","gxf6+","Kxf6","Rxc6+","Ke7","Qf4"] },
  { fen: "5r2/r2P1p1k/p3p1p1/1p4Qp/2pP3P/R1nq1b2/5PP1/2B1R1K1 w - - 0 1", solution: ["Qh6+","Kg8","Qxf8+","Kxf8","d8=Q+","Kg7","Bh6+","Kh7","Qf6"] },
  { fen: "r1bq1rk1/6bp/p1Rp1n2/3Pp3/2p1P3/2N1B3/PP1Q3P/1K4NR b - - 0 1", solution: ["Nxe4","Nxe4","Bf5","Qc2","Qh4","Rxc4","Rac8","Nf3","Rxc4","Nxh4","Bxe4"] },
  { fen: "3rk1n1/5p2/p3pPp1/1pq5/5Q1P/1B2P3/PP2KP2/3R4 w - - 0 1", solution: ["Rxd8+","Kxd8","Qb8+","Qc8","Qxc8+","Kxc8","Bxe6+"] }
]

const PALOMITA_22 = [
  { fen: "8/1pk5/2p1P3/3r4/6Q1/1p1q4/PP3P2/K5R1 w - - 0 1", solution: ["e7","Re5","Qg7","Kd6","Qxe5+"] },
  { fen: "r4r1k/p1pb4/1p1p3p/3Pq2P/2P1pp2/3BB3/PPQN1P1P/6RK w - - 0 1", solution: ["Nf3","exd3","Qxd3","Bf5","Qe2","fxe3","Nxe5","exf2","Rg2","Be4","Ng6+","Bxg6","Rxf2"] },
  { fen: "r2q1rk1/pp2pp2/3pnbp1/3R4/2P3BQ/4BR2/PP4PP/6K1 w - - 0 1", solution: ["Qh6","Bg7","Qxg6","Nf4","Rxf4","fxg6","Be6+","Rf7","Rxf7","Kh8","Rg5","b5","Rg3"] },
  { fen: "4r1k1/5pb1/r1p1bnpp/6B1/5P2/qP3B2/P2QR1PP/2NR3K w - - 0 1", solution: ["f5","hxg5","fxe6","Rxe6","Rxe6","fxe6","Qxg5"] },
  { fen: "2Rr1rk1/pn1P1pp1/1q5p/1p3Q2/3N4/8/5PPP/4R1K1 w - - 0 1", solution: ["Nc6","Nd6","Nxd8","Nxf5","Nc6"] },
  { fen: "2r3k1/5p1p/5qp1/1P6/p2Nn3/2rNP2P/5PP1/Q2R2K1 b - - 0 1", solution: ["Rxd3","Rxd3","Qxf2+","Kh2","Qg3+","Kg1","Nf2"] },
  { fen: "2br1r1k/p5b1/np1P2q1/1Np2pNn/2P1p2B/P6P/1P2R1BK/4Q1R1 w - - 0 1", solution: ["Nxe4","fxe4","Bxe4","Qe6","Rxg7","Kxg7","Bxd8","Rxd8","Rg2+","Kh8","Qc3+","Qf6","Rg5","Qxc3","Rxh5+","Kg7","bxc3"] },
  { fen: "2r1r1k1/pbq1bp2/1pn3p1/6Bp/7Q/PB3N2/1P3PPP/R3R1K1 w - - 0 1", solution: ["Qe4","Kg7","Bxf7","Kxf7","Bh6","Qd6","Qc4+","Kf6","Rad1","Nd4","Qxd4+","Qxd4","Rxd4","Rc5","h4"] },
  { fen: "2rr2k1/pb2qpbp/2n3p1/2RpP3/6N1/1B4NP/PP3PP1/2Q1R1K1 w - - 0 1", solution: ["Nf6+","Kh8","Nxd5"] },
  { fen: "r1q1kr2/1b2bn1Q/3pp1p1/1N4P1/4n3/P1N1B3/1PP4P/2KR1R2 w q - 0 1", solution: ["Rxf7","Rxf7","Qg8+","Rf8","Qxg6+","Kd7","Nxe4","Bxe4","Qxe4"] },
  { fen: "4n1k1/rp2r2p/2p1pnpQ/6N1/3P4/5R2/q4PPP/2R2BK1 w - - 0 1", solution: ["Ne4","Nd7","Qg5","Rf7","Bc4","Qb2","Bxe6"] },
  { fen: "4r2k/1pp3pp/pn1b1r1q/3P2R1/1P2pP1P/P1N1n3/1B2BQ2/6RK w - - 0 1", solution: ["Nxe4","Rg6","Nxd6","cxd6","Rh5"] },
  { fen: "r3k2r/1q3ppp/p3p3/2b1P3/p2N1Q2/P7/1PP3PP/3R1R1K w kq - 0 1", solution: ["Nxe6","fxe6","Qg4","Qc6","Qxg7","Rf8","Rxf8+","Bxf8","Qxh7"] },
  { fen: "1nr1n1k1/1r2qppp/b1pRp3/ppP1N3/4P3/4B1PB/PQ3P1P/3R2K1 w - - 0 1", solution: ["Nxf7","Kxf7","Bxe6+","Qxe6","Rxe6","Kxe6","Qb3+","Ke7","Qg8","h6","Rd6","Nxd6","cxd6+","Kd7","Qf7+","Kxd6","Bf4+","Kc5","Qf5+"] },
  { fen: "rr4k1/p3npb1/2pq2p1/2Np3p/1P2p1bP/Q2PP1P1/P2B1PB1/2R2RK1 b - - 0 1", solution: ["a5","dxe4","Be2","Qb3","Bc4","Qb1","axb4","Bxb4","Bxa2","Nd3","Bxb1","Bxd6","Bxd3"] },
  { fen: "1r1r4/2p1n3/2P2kp1/1RRPp2p/1B2p3/4P3/5PPP/5K2 w - - 0 1", solution: ["d6","Ra8","dxe7","Ra1+","Be1","Rdd1","g3","Rxe1+","Kg2","Kxe7","Rxe5+"] },
  { fen: "5rk1/pp1q2p1/3p1nnp/2pPpr2/P1P1N3/3Q1PP1/2P4P/R1B2RK1 w - - 0 1", solution: ["Nxd6","e4","Nxe4","Ne5","Nxc5","Qc8","Qd4","Nxf3+","Rxf3","Rxf3","Ne6"] },
  { fen: "6r1/1r5p/b2pk3/2p2pn1/p1P3nN/P3P1PB/1PR3KP/3RB3 w - - 0 1", solution: ["Nxf5","Nxh3","e4","Nf4+","Kh1","Rb6","gxf4","Bb7","Re2","Bxe4+"] },
  { fen: "r2r4/pp3pkp/4pnp1/3N2q1/2P3P1/PP3P2/1Q4KP/R4R2 w - - 0 1", solution: ["h4","Qxh4","Rh1","Qg5","Rxh7+","Kf8","Qxf6"] },
  { fen: "r3k2r/ppq2p2/4b2p/3P4/2pnQ1p1/8/P2N1PPP/2R2RK1 b kq - 0 1", solution: ["Qf4","Rxc4","Qxe4","Nxe4","Ne2+","Kh1","f5","dxe6","fxe4","Rxe4","Nc3"] },
  { fen: "1q1r2k1/r3bp1p/p3b1pB/1pp5/2n3N1/1BP4P/PP2QPP1/3RR1K1 w - - 0 1", solution: ["Rxd8+","Bxd8","Bxc4","bxc4","Qxc4"] },
  { fen: "r4r2/ppQbkp1p/3Nq1p1/1p6/4P1n1/2P5/P4PPP/3R1RK1 w - - 0 1", solution: ["Nf5+","gxf5","exf5","Rac8","Rxd7+","Qxd7","f6+","Nxf6","Re1+","Ne4","Rxe4+","Kf6","Qxd7"] },
  { fen: "4k2r/5p1P/4p3/4P1N1/1PRn1PP1/8/p4K2/8 w - - 0 1", solution: ["Rc8+","Kd7","Rxh8","a1=Q","Rd8+","Kxd8","h8=Q+","Kd7","Nxf7","Qb2+","Kg3","Qc3+","Kh4","Qe1+","Kg5"] },
  { fen: "7r/1pq1prk1/2b1Rpp1/8/3B3p/7P/PQP3P1/4R1K1 w - - 0 1", solution: ["Rxe7","Qg3","Bxf6+","Kh6","R1e4"] },
  { fen: "8/2k1nB2/Kp4p1/p1p2p1p/P4P1P/2P3P1/1P6/8 w - - 0 1", solution: ["Be8","Kd8","Bxg6","Nxg6","Kxb6","Kd7","Kxc5","Ne7","b4","axb4","cxb4","Nc8","a5","Nd6","b5","Ne4+","Kb6","Kc8","Kc6","Kb8","b6"] },
  { fen: "1rb1r1k1/p1p1qppp/2pb4/8/2P3n1/4P1P1/PB2BP1P/R1QN1RK1 b - - 0 1", solution: ["Nxh2","c5","Nxf1","cxd6","Nxg3","fxg3","Qxd6"] },
  { fen: "2k2r2/2q2p2/p2r2pp/8/B5PP/2P2Q2/PP3P2/2K1R3 w - - 0 1", solution: ["Re7","Rd1+","Kxd1","Qxe7","Qa8+","Kc7","Qa7+","Kd6","Qb6+"] },
  { fen: "2r4k/2nnqpb1/4pN1p/p2pP3/3P3P/1P2Q1R1/1B1N1P2/6K1 w - - 0 1", solution: ["Nc4","Nxf6","Ba3","Qd7","exf6"] },
  { fen: "3r1r1k/bp4pp/p2np3/3pn3/8/PQ2PPPq/1P2BR1P/1NBR2K1 b - - 0 1", solution: ["Ne4","fxe4","Rxf2","Kxf2","Qxh2+","Ke1","Rf8","Kd2","Nc4+","Kd3","dxe4+"] },
  { fen: "rnq1r1k1/5pp1/p2Bpn1p/2p1N3/2P5/8/PPQR1PPP/3R2K1 w - - 0 1", solution: ["Be7","Qc7","Bxf6","gxf6","Qe4","Ra7","Ng4","Kg7","Qe3","Rh8","Rd8"] },
  { fen: "1nq1rb1k/prp3pp/1pN1p3/5p1N/2PP2Q1/6R1/PP3PPP/R5K1 w - - 0 1", solution: ["Qh4","Nxc6","Nf6","h6","Qxh6+","gxh6","Rg8#"] },
  { fen: "r6r/2k1bpp1/pp5p/2pR4/5q2/P1P2N2/2Q2PPP/R5K1 w - - 0 1", solution: ["Re1","Bd6","Rf5","Qc4","Re4","Qb5","Rxf7+"] },
  { fen: "8/4k3/1p2p1pp/rBn2p2/P2R4/2P3P1/3r1PKP/R7 b - - 0 1", solution: ["Rxd4","cxd4","Nxa4","Rxa4","Rxb5","Ra7+","Kd6"] },
  { fen: "3r3r/p4pp1/2p3b1/N1n2kPp/PnN4P/4RP2/1P2K3/5B1R w - - 0 1", solution: ["Nb7","Rd4","Kf2","Rxc4"] },
  { fen: "r2r2k1/1p1bppbp/6p1/p1Pnq3/N1B1P3/P4P2/1PQ3PP/R1B1K2R b KQ - 0 1", solution: ["Bxa4","Qxa4","Nc3","bxc3","Qxc3+","Ke2","Qxa1"] },
  { fen: "r3qrk1/p3R1bp/6p1/1pp1P3/1n5Q/5N2/PP3PPP/2KR4 b - - 0 1", solution: ["Bh6+","Kb1","Rd8","Rd6","Qc6","a3","Rxd6","exd6","Qxd6","axb4","cxb4","Qe4","b3","Nd4","Rf4","Qa8+","Bf8"] },
  { fen: "2n3k1/6b1/1p1pR2p/1q1Pp3/2r1P3/6PB/8/5QK1 w - - 0 1", solution: ["Rxh6","Bxh6","Be6+","Kh8","Qf6+"] },
  { fen: "3rk2r/1bq1b2p/pN1pQ1p1/2P5/8/1P4P1/P4P1P/R3R1K1 w k - 0 1", solution: ["c6","Bxc6","Rac1","Rd7","Nxd7","Qxd7","Qc4"] },
  { fen: "3R4/5p2/1p2pkp1/1P2b2p/2BnP3/4B1PP/5PK1/3r4 w - - 0 1", solution: ["Rd7","g5","Be2","Nxe2","Rxd1"] },
  { fen: "6k1/1p1r1pp1/5qp1/p1pB4/Pb2Pn2/1Q1RB2P/1P3PP1/6K1 w - - 0 1", solution: ["e5","Qf5","Bxf4","Qxf4","e6","Rd8","e7","Re8","g3","Qf6","Rf3"] },
  { fen: "5rn1/2pq1p1k/3p3p/1p3P1Q/1P1b4/1B2N1P1/5P2/4R1K1 w - - 0 1", solution: ["Ng4","Kg7","Nxh6","Bf6","Bxf7"] },
  { fen: "3r4/p1qn1pk1/1p1R3p/2P1pQpP/8/4B3/5PP1/6K1 w - - 0 1", solution: ["Bxg5","hxg5","Qxg5+","Kf8","h6","bxc5","h7"] },
  { fen: "2b3rk/4np1p/p6P/2r1qpQR/1pP1p3/4N3/PPB2PP1/1K1R4 w - - 0 1", solution: ["Ng4","Qe6","Rd8","Ng6","Rxg8+","Kxg8","Qd8+","Nf8","Rg5+"] },
  { fen: "6k1/p5r1/1p1p1R1b/1P1P4/1P2p1qB/6Pp/2Q5/7K b - - 0 1", solution: ["e3","Re6","Rc7","Rg6+","Bg7","Rxg4","Rxc2"] },
  { fen: "2r3k1/2r2pp1/PQ1p4/3Bp2p/1N2P2b/7q/5P1P/RR4K1 b - - 0 1", solution: ["Rc5","Nd3","Qxd3","Qxc5","Rxc5","Rb2","Bxf2+","Rxf2","Qd4","Ra3","Rc2","Raf3","Qa1+","Kg2","Rxf2+","Rxf2","Qxa6"] },
  { fen: "1r3r2/1b1qbpk1/p2p2p1/n1pBp1Np/Pp2P2P/3PQ3/1PPB1PP1/R3R1K1 w - - 0 1", solution: ["Nh7","Bxd5","Qh6+","Kg8","Bg5","Bxg5","hxg5","f5"] },
  { fen: "5rk1/2N2ppp/4p3/R1b2q2/4b3/6Q1/5PPP/5RK1 b - - 0 1", solution: ["Bxf2+","Qxf2","Qxa5","Nxe6","Bxg2","Kxg2","Qa8+","Kg1","fxe6"] }
]

const PALOMITA_23 = [
  { fen: "br3r2/5ppk/p2pp3/2q1b1BP/N3P3/n4P2/KP1QB3/6RR b - - 0 1", solution: ["Nc2","Kb1","Qa3"] },
  { fen: "3q2k1/1b2rpp1/1n5p/pP2p3/2B1P3/1Q3NP1/5PP1/2R3K1 w - - 0 1", solution: ["Bxf7+","Kh7","Rd1"] },
  { fen: "2r4k/6p1/1p2P2p/p2p4/3P2RP/KP1bP3/P1r2P2/6RB b - - 0 1", solution: ["b5","Ra1","Bf5","Rg2","Bxe6","f4","b4+","Ka4","R2c5"] },
  { fen: "4rr1k/pp4p1/2b2pQp/q1n2P2/2PB3R/1BP1p3/P3R1PP/6K1 w - - 0 1", solution: ["Rxh6+","gxh6","Qxh6+","Kg8","Qg6+","Kh8","Bxf6+","Rxf6","Qxf6+","Kg8","Qg6+","Kf8","f6","Qc7","Qh6+","Kg8","Qg5+","Kh7","Qxc5","Re5","Qf8","Rh5","Bc2+"] },
  { fen: "r6r/4kp2/3p1n2/1N1P1Q2/2p1P3/7P/1qB3P1/5R1K w - - 0 1", solution: ["Qf4","Qe5","Qxe5+","dxe5","d6+","Ke6","Nc7+","Kxd6","Nxa8"] },
  { fen: "2b2rk1/r5p1/pq2ppQp/1p1pPP2/3N4/3R4/PPP3PP/1K1R4 w - - 0 1", solution: ["Rh3","fxe5","Rxh6","Rf6","Qe8+","Rf8","Rh8+","Kxh8","Qxf8+"] },
  { fen: "r5k1/1pr1pbb1/p4p2/5Np1/1Pn1B3/P1Q2P2/qBP3P1/2KR3R w - - 0 1", solution: ["Rh7","Qxb2+","Qxb2","Nxb2","Rxg7+","Kf8","Rh1"] },
  { fen: "R7/1r2ppk1/3p2p1/1pqN4/4r2p/2P4K/1P1Q3P/R7 w - - 0 1", solution: ["Rh8","f6","Qh6+","Kf7","Rh7+","Ke6","Qxg6"] },
  { fen: "6rk/3R2bp/6q1/1p2r3/5p2/2P1pP1Q/1P2B1PP/3R2K1 b - - 0 1", solution: ["Rh5","R7d6","Bf6","Rxf6","Qc2","Qxh5","Qxe2","g4","Qf2+"] },
  { fen: "1r3rk1/5ppp/2N1p3/1Bb1p1q1/4n3/P6P/4QPP1/2R2RK1 w - - 0 1", solution: ["Qxe4","Rxb5","Qc4","Bxa3","Qxb5","Bxc1","Qc5","Bb2","Ne7+","Kh8","Ng6+","hxg6","Qxf8+"] },
  { fen: "6k1/5p1p/P1pb1n2/6p1/3P4/1BPq1PP1/1P1NbK1P/R1B5 b - - 0 1", solution: ["Bxf3","Nxf3","Ne4+","Ke1","Nxc3","bxc3","Qxc3+"] },
  { fen: "4r1k1/3rppbp/pRN2np1/8/4P3/6PP/q4PB1/2Q1R1K1 w - - 0 1", solution: ["e5","Nd5","Rb2","Qa4","Bxd5","Rxd5","Rb4","Qa2","Nxe7+","Kh8","Nxd5"] },
  { fen: "r3k2r/2Rb1p2/p3p1pp/1pBnP3/4q2P/5N2/2P2PP1/1R1Q2K1 w kq - 0 1", solution: ["Rxd7","Kxd7","Rb4","Qxb4","Bxb4"] },
  { fen: "2rr2k1/pp1bbpp1/4pn2/q3P1P1/8/2N1Q3/PPP1B1P1/1K1R3R b - - 0 1", solution: ["Rxc3","Bd3","Rxd3","cxd3","Ng4","Qh3","Nh6"] },
  { fen: "5rk1/1br1qppp/p3p3/1pnpPP2/3N3P/1PbBB3/P1P1Q1P1/1K1R3R w - - 0 1", solution: ["f6","gxf6","Bxh7+","Kxh7","Qh5+","Kg8","Qg4+","Kh7","Bg5","Rh8","Bxf6","Qf8","Nf3","Kh6","Ng5","Rg8","Qf4"] },
  { fen: "3brnk1/1b1q3p/pprPp1pQ/3N1p2/2PB1P2/3B2R1/PP4PP/5RK1 w - - 0 1", solution: ["Re1","Rxd6","Bxf5","Qf7","Bxg6","Nxg6","f5","e5","Bxe5","Bxd5","cxd5","Rxe5","Rxe5"] },
  { fen: "2r5/p2r3p/4k3/2PN1p2/1PKRpP2/8/P5PP/8 w - - 0 1", solution: ["g4","Rg7","Ne3","fxg4","Rd6+","Kf7","Nf5","e3","Nxg7","Re8","Nxe8","e2","Rf6+"] },
  { fen: "q4rk1/2Q1bppp/3p4/r3nPP1/4P2P/Np2B3/1P4B1/1K1R3R b - - 0 1", solution: ["Rc8","Qxe7","Nc4","g6","hxg6","fxg6","Nxa3+","bxa3","Rxa3","gxf7+","Kh7"] },
  { fen: "2r2rk1/pbq3pp/3bp1n1/4Np2/Pp1PpP2/1P5R/1BPNQ1PP/5RK1 w - - 0 1", solution: ["Qh5","Bxe5","fxe5","Qxc2","Qxh7+","Kf7","Rg3","Qxd2","Rxg6","Rg8","Rxe6","Kxe6","Qxf5+","Ke7","Qf7+","Kd8","e6"] },
  { fen: "r4rk1/2q1bppp/p2p1nP1/1p1Qp3/8/3BBP2/PPP4P/2KR2R1 w - - 0 1", solution: ["gxf7+","Kh8","Rxg7","Kxg7","Rg1+","Kh8","Bh6","Ng4","Rxg4","Rxf7","Qxa8+"] },
  { fen: "2r3k1/rnP2pp1/1pp2np1/8/1PP1p3/2N3P1/P3BP1P/2RR2K1 w - - 0 1", solution: ["c5","bxc5","b5","cxb5","Nxb5"] },
  { fen: "r3rbk1/2qn1ppp/p1b5/1p2p1B1/1P3nN1/2P3NP/P1B2PP1/R2QR1K1 w - - 0 1", solution: ["Bxf4","exf4","Nh6+","Kh8","Nxf7+","Kg8","Bxh7+","Kxh7","Ng5+","Kg8","Qb3+","Kh8","Qf7"] },
  { fen: "3r3k/1p3r1p/pn1q1p2/2p5/3nR3/1PN4P/P4QP1/3R1BK1 w - - 0 1", solution: ["b4","f5","bxc5","fxe4","Qxf7","Qxc5","Qf6+","Kg8","Qxd8+"] },
  { fen: "rn2kb1r/pp1n1pp1/4p3/5q2/2PpNB1p/5Q1P/PP2BPP1/R4RK1 w kq - 0 1", solution: ["Bd3","Qh5","Nf6+","gxf6","Qxb7"] },
  { fen: "4r2k/1p4pp/2p2n2/p6q/PbQB1P2/1N4P1/1P5P/5RK1 b - - 0 1", solution: ["Ng4","Qc2","c5","Nxc5","Rc8"] },
  { fen: "5rk1/ppq3Np/1bp3nB/3p4/3Pn1P1/3Q1N1P/PP3P2/4R1K1 b - - 0 1", solution: ["Nxf2","Kxf2","Qh2+","Ke3","Qg2","Qe2","Rxf3+","Qxf3","Bxd4+","Kxd4","Qxf3"] },
  { fen: "2r1k2r/pp3p1p/4p3/3pPb2/1npP1P2/q1N2Q1P/2PKNB2/3R3R w k - 0 1", solution: ["Ra1","Qb2","Rhc1","Nxc2","Ra2","Nxd4+","Rxb2","Nxf3+","Ke3","d4+","Kxf3","dxc3","Nxc3"] },
  { fen: "3r1r1k/4bp1p/p4p2/qnpp3Q/4NB2/3P3P/BP4PK/R7 w - - 0 1", solution: ["Nxf6","Bxf6","d4","Qxa2","Rxa2"] },
  { fen: "5nk1/2Q5/p1N2q1p/1p4p1/1P2p1b1/P5P1/2PKN2P/8 b - - 0 1", solution: ["e3+","Kd3","Bxe2+","Kxe2","Qf2+","Kd3","Qd2+","Ke4","e2","Ne7+","Kh8","Qe5+","Kh7","Qf5+","Kg7","Qe5+","Kf7"] },
  { fen: "4r1k1/pb1q3p/1p1p1QpB/n1pPp3/2P3R1/2P3P1/6BP/7K w - - 0 1", solution: ["Rxg6+","hxg6","Qxg6+","Kh8","Bh3","Qh7","Qf6+","Kg8","Be6+","Rxe6","Qf8#"] },
  { fen: "rnb1kb1r/1pqn1ppp/p3p3/4P3/2BN4/2N5/PP2QPPP/R1B1K2R w KQkq - 0 1", solution: ["Bxe6","fxe6","Nxe6","Qxe5","Nc7+"] },
  { fen: "1r3rk1/5p1p/p2p1qp1/n1pP3n/2P2P2/3bPR2/P2N2BP/2QNR1K1 b - - 0 1", solution: ["Nxc4","e4","Nxf4","Nxc4","Qd4+","Nf2","Rb1"] },
  { fen: "2rr2k1/1p3p2/p3bn1p/q2p4/3P4/b1N2B2/1P1Q1PPP/R3R1K1 b - - 0 1", solution: ["Bxb2","Rxa5","Bxc3","Qxh6","Bxe1","Ra3","Bb4","Rb3","Bf8","Qxf6","Rc1+"] },
  { fen: "r4rk1/2p1bppp/p7/n2qp3/PP6/2pn1N1P/2R2PP1/2BQRNK1 w - - 0 1", solution: ["Rxe5","Qd8","Rxe7","Qxe7","Qxd3","Qxb4","Ng5","g6","Rxc3","Qxa4","Ba3","Rfe8","Qf3"] },
  { fen: "r1b1qrk1/p2p2b1/1pp2np1/2P1np2/5N2/2N3P1/PP2PPB1/R1BQK2R w KQ - 0 1", solution: ["Nb5","bxc5","Nd6","Qe7","Be3"] },
  { fen: "5rk1/6rp/p1npb2b/1p1Npp2/5P1q/2P1N1P1/PPB4P/R2Q1RK1 w - - 0 1", solution: ["Nc7","exf4","Ng2","Qh3","Rxf4","Bxf4","Nxf4","Rxg3+","Kh1"] },
  { fen: "2r3k1/5pp1/1pq5/p2R2P1/n2BP3/4QP2/1Pr5/1K5R w - - 0 1", solution: ["g6","fxg6","Rh8+","Kxh8","Qh6+","Kg8","Qxg7#"] },
  { fen: "r1q1r1k1/1bp1bppp/p2p4/1p1n3Q/3P3n/1BP1B1NP/PP3PPN/R3R1K1 b - - 0 1", solution: ["g6","Qh6","Nxg2","Kxg2","Nf4+","Kg1","Bg5","Bxf7+","Kh8"] },
  { fen: "6k1/Q3ppbp/1p4p1/3qN3/1P1n4/P1r2N1P/5PP1/4R2K b - - 0 1", solution: ["Bxe5","Nxe5","Rxh3+","Kg1","Ne2+","Kf1","Nf4","Qb8+","Kg7","Nf3","Rh1+","Ng1","Rxg1+","Kxg1","Qxg2#"] },
  { fen: "5rk1/p2bq2p/1p6/2pPp2p/2P1B3/4Q1P1/PP3R2/6K1 w - - 0 1", solution: ["d6","Qg7","Bd5+","Kh8","Rxf8+","Qxf8","Qxe5+","Qg7","Qf4"] },
  { fen: "5rk1/6pp/1pqNp3/3b1p2/pP1P2n1/P5P1/3nQPBP/R1B3K1 w - - 0 1", solution: ["Qxe6+","Bxe6","Bxc6","Nb3","d5","Ne5","Rb1"] },
  { fen: "3r3r/p1kn1b1p/2Bb1pp1/1p6/3P1NP1/2P2Q2/qP2NP2/2KR3R b - - 0 1", solution: ["Bxf4+","Nxf4","Ne5","dxe5","Qa1+","Kc2","Bb3+","Kxb3","Qa4#"] },
  { fen: "3r1rk1/1p4p1/1qp1p2p/3nP3/pPR5/3Q2PP/P2R1PB1/6K1 w - - 0 1", solution: ["Qg6","Nf4","Rxf4","Rxf4","Rxd8+","Qxd8","gxf4"] },
  { fen: "2r3k1/p2b3p/1q2p1pQ/4R3/1p1P2PP/1N3r2/PP2R3/1K6 b - - 0 1", solution: ["Bb5","R2e3","Rf2"] },
  { fen: "rq2r1k1/3nPppp/1p2p3/p7/P1PNbP2/4B1P1/1P2Q2P/R2R2K1 w - - 0 1", solution: ["Nxe6","Rxe7","Nxg7","Qb7","Bd4"] },
  { fen: "5rk1/1p5p/3p1q2/1PpPpbb1/2P2np1/R5P1/3N1P1P/3QNBK1 b - - 0 1", solution: ["Bc2","Nxc2","Nh3+","Bxh3","Qxf2+","Kh1","gxh3","Qg1","Qxd2","Ra2","Qe2"] },
  { fen: "rn2rk2/5pp1/p7/2pb1qN1/7Q/2P5/5PPP/1R3RK1 w - - 0 1", solution: ["Rbe1","Rxe1","Rxe1","Be6","Qh8+","Ke7","h4","Qd5","Qxg7","Kd8","h5"] }
]

const SEED_BLOCKS_PALOMITA = [
  { name: "Bloque 1", description: "Bloque 1", category: "palomita", subcategory: "Easy Exercises", puzzles: PUZZLE_PALOMITA_1 },
  { name: "Bloque 2", description: "Bloque 2", category: "palomita", subcategory: "Easy Exercises", puzzles: PALOMITA_2 },
  { name: "Bloque 3", description: "Bloque 3", category: "palomita", subcategory: "Easy Exercises", puzzles: PALOMITA_3 },
  { name: "Bloque 4", description: "Bloque 4", category: "palomita", subcategory: "Easy Exercises", puzzles: PALOMITA_4 },
  { name: "Bloque 5", description: "Bloque 5", category: "palomita", subcategory: "Easy Exercises", puzzles: PALOMITA_5 },
  { name: "Bloque 1", description: "Bloque 1", category: "palomita", subcategory: "Intermediate Exercises 1", puzzles: PALOMITA_6 },
  { name: "Bloque 1", description: "Bloque 1", category: "palomita", subcategory: "Intermediate Exercises 2", puzzles: PALOMITA_7 },
  { name: "Bloque 1", description: "Bloque 1", category: "palomita", subcategory: "Intermediate Exercises 3", puzzles: PALOMITA_8 },
  { name: "Bloque 2", description: "Bloque 2", category: "palomita", subcategory: "Intermediate Exercises 3", puzzles: PALOMITA_9 },
  { name: "Bloque 3", description: "Bloque 3", category: "palomita", subcategory: "Intermediate Exercises 3", puzzles: PALOMITA_10 },
  { name: "Bloque 1", description: "Bloque 1", category: "palomita", subcategory: "Intermediate Exercises 4", puzzles: PALOMITA_11 },
  { name: "Bloque 1", description: "Bloque 1", category: "palomita", subcategory: "Intermediate Exercises 5", puzzles: PALOMITA_12 },
  { name: "Bloque 2", description: "Bloque 2", category: "palomita", subcategory: "Intermediate Exercises 5", puzzles: PALOMITA_13 },
  { name: "Bloque 3", description: "Bloque 3", category: "palomita", subcategory: "Intermediate Exercises 5", puzzles: PALOMITA_14 },
  { name: "Bloque 4", description: "Bloque 4", category: "palomita", subcategory: "Intermediate Exercises 5", puzzles: PALOMITA_15 },
  { name: "Bloque 1", description: "Bloque 1", category: "palomita", subcategory: "Intermediate Exercises 6", puzzles: PALOMITA_16 },
  { name: "Bloque 2", description: "Bloque 2", category: "palomita", subcategory: "Intermediate Exercises 6", puzzles: PALOMITA_17 },
  { name: "Bloque 3", description: "Bloque 3", category: "palomita", subcategory: "Intermediate Exercises 6", puzzles: PALOMITA_18 },
  { name: "Bloque 4", description: "Bloque 4", category: "palomita", subcategory: "Intermediate Exercises 6", puzzles: PALOMITA_19 },
  { name: "Bloque 5", description: "Bloque 5", category: "palomita", subcategory: "Intermediate Exercises 6", puzzles: PALOMITA_20 },
  { name: "Bloque 1", description: "Bloque 1", category: "palomita", subcategory: "Advanced Exercises", puzzles: PALOMITA_21 },
  { name: "Bloque 2", description: "Bloque 2", category: "palomita", subcategory: "Advanced Exercises", puzzles: PALOMITA_22 },
  { name: "Bloque 3", description: "Bloque 3", category: "palomita", subcategory: "Advanced Exercises", puzzles: PALOMITA_23 }
]

const SEED_BLOCKS = [
  ...SEED_BLOCKS_WOODPECKER2,
  ...SEED_BLOCKS_CHECKMATE_PATTERNS,
  ...SEED_BLOCKS_PALOMITA,
]
// ─── BLIND PUZZLES ────────────────────────────────────────────────────────────
const BLIND_PUZZLES = [
  {
    order: 1,
    fen: "kr6/1p6/p7/4b3/8/8/6BP/R6K w - - 0 1",
    solution: ["Rxa6#"]
  },
  {
    order: 2,
    fen: "r2B3k/5p1p/8/8/8/b7/7P/K5R1 w - - 0 1",
    solution: ["Bf6#"]
  },
  {
    order: 3,
    fen: "8/R6p/4pkp1/3rN3/3P3P/6P1/2n3K1/8 w - - 0 1",
    solution: ["Rf7#"]
  },
  {
    order: 4,
    fen: "7k/2r1n1p1/4Bp2/3P4/5K2/6P1/2p2PP1/R7 w - - 0 1",
    solution: ["Rh1#"]
  },
  {
    order: 5,
    fen: "1k1r4/1bNr4/3P1p2/6p1/7p/8/6PP/RR5K w - - 0 1",
    solution: ["Ra8#"]
  },
  {
    order: 6,
    fen: "r6R/ppk1b3/2p1P3/P7/3N4/4q3/6PP/2R4K w - - 0 1",
    solution: ["Nb5#"]
  },
  {
    order: 7,
    fen: "2rrk1n1/1nQ1p2N/pB5p/6p1/qP3p2/2P4P/P3BPP1/3R2K1 w - - 0 1",
    solution: ["Bh5#"]
  },
  {
    order: 8,
    fen: "8/P7/2b1n3/2bk1N2/5P2/3P2Pp/4P2P/7K w - - 0 1",
    solution: ["e4#"]
  },
  {
    order: 9,
    fen: "6kb/p3p2p/5P1B/4Nn2/8/8/7P/R6K w - - 0 1",
    solution: ["f7#"]
  },
  {
    order: 10,
    fen: "r2B3k/5p1p/7N/8/8/b7/7P/K7 w - - 0 1",
    solution: ["Bf6#"]
  },
  {
    order: 11,
    fen: "n3r2r/k1P4R/pp6/8/8/5BB1/6P1/7K w - - 0 1",
    solution: ["c8=N#"]
  },
  {
    order: 12,
    fen: "1kb2q2/ppp5/3pn3/1N6/P7/1P6/2P2QPP/7K w - - 0 1",
    solution: ["Qxa7#"]
  },
  {
    order: 13,
    fen: "r7/8/rR6/5kn1/3P1p2/3P3P/6P1/5R1K w - - 0 1",
    solution: ["g4#"]
  },
  {
    order: 14,
    fen: "r2qkb1r/pp2nppp/2p5/4N3/2BP4/2N5/PP3PPP/R2bK2R w KQkq - 0 1",
    solution: ["Bxf7#"]
  },
  {
    order: 15,
    fen: "1kr5/p7/6p1/5b2/1N6/5B2/6PP/1R5K w - - 0 1",
    solution: ["Na6#"]
  },
  {
    order: 16,
    fen: "4nkq1/2p3pp/1r1p4/8/5B2/1Q4P1/P6P/5R1K w - - 0 1",
    solution: ["Bxd6#"]
  },
  {
    order: 17,
    fen: "8/3b2Q1/3Pkr2/1p6/4P2p/7P/P5PK/8 w - - 0 1",
    solution: ["Qe7#"]
  },
  {
    order: 18,
    fen: "8/p1p1bkp1/2Q1nNq1/3pP1rp/1P1P1p2/P4PrP/1B4PK/2R3R1 w - - 0 1",
    solution: ["Qe8#"]
  },
  {
    order: 19,
    fen: "8/5Q2/8/6p1/6kr/4K3/8/8 w - - 0 1",
    solution: ["Qf3#"]
  },
  {
    order: 20,
    fen: "4r1rk/pppp2p1/4p2p/2nq2N1/8/3QP1P1/PBPP1P2/1K5R w - - 0 1",
    solution: ["Qh7#"]
  },
  {
    order: 21,
    fen: "4kr2/2r2p2/2N1p3/4R2B/5P2/1Pq5/P1P3PP/2KR4 w - - 0 1",
    solution: ["Rd8#"]
  },
  {
    order: 22,
    fen: "r1b2R2/ppp1k2p/2np1N2/4P3/2B5/8/PPP1K1PP/8 w - - 0 1",
    solution: ["Re8#"]
  },
  {
    order: 23,
    fen: "4Q3/8/q4p1p/5kb1/1Pb5/2P1BP2/1K4P1/8 w - - 0 1",
    solution: ["g4#"]
  },
  {
    order: 24,
    fen: "r2qk2r/ppp1npBp/2nb4/3N4/2B3b1/P4N2/5PPP/R2QR1K1 w kq - 0 1",
    solution: ["Nf6#"]
  },
  {
    order: 25,
    fen: "r1bqkb1r/pp1npppp/2p2n2/8/3PN3/8/PPP1QPPP/R1B1KBNR w KQkq - 0 1",
    solution: ["Nd6#"]
  },
  {
    order: 26,
    fen: "r3q1n1/4k3/7R/1pp3P1/1P2P3/r1N5/P1P4Q/1K3R2 w - - 0 1",
    solution: ["Qd6#"]
  },
  {
    order: 27,
    fen: "r3kb1r/pp3p1p/4bB1q/4Q3/5p2/3P4/PPP3PP/4R2K w kq - 0 1",
    solution: ["Qb5#"]
  },
  {
    order: 28,
    fen: "3kq3/R6r/8/8/3KQ3/8/8/8 w - - 0 1",
    solution: ["Qa8#"]
  },
  {
    order: 29,
    fen: "8/8/8/knN5/1n6/8/3N4/4K3 w - - 0 1",
    solution: ["Nc4#"]
  },
  {
    order: 30,
    fen: "4k3/5p2/2N2Qp1/2p4p/1p2q3/7P/5PPK/8 w - - 0 1",
    solution: ["Qd8#"]
  },
  {
    order: 31,
    fen: "r1b4r/p1Q5/1p2p3/1q3k2/5B2/2p2P2/P5PP/3R2K1 w - - 0 1",
    solution: ["Qf7#"]
  },
  {
    order: 32,
    fen: "rnbq1bnr/ppppk2p/8/7Q/2B1Pp2/8/PPPP2PP/RNB1K2R w KQ - 0 1",
    solution: ["Qe5#"]
  },
  {
    order: 33,
    fen: "2r2r1k/3R1p2/p1P3R1/1p2q1Pp/7P/5Q2/P4PK1/8 w - - 0 1",
    solution: ["Qxh5#"]
  },
  {
    order: 34,
    fen: "4r2k/7p/p1pQ2pN/8/4q3/7R/P1P3PK/8 w - - 0 1",
    solution: ["Qf6#"]
  },
  {
    order: 35,
    fen: "6n1/5kp1/6Np/6PP/B7/2q5/p7/4R2K w - - 0 1",
    solution: ["Be8#"]
  },
  {
    order: 36,
    fen: "1Q2r3/8/p1k4p/qpNbB3/8/1P6/2P5/1K6 w - - 0 1",
    solution: ["Qd6#"]
  },
  {
    order: 37,
    fen: "r1bqk2r/p1pn2p1/1p2pn1p/8/3P4/BPP5/P1B2PPP/R3K1NR w KQkq - 0 1",
    solution: ["Bg6#"]
  },
  {
    order: 38,
    fen: "R7/3b2kr/1p1p3N/2pPn1B1/2P5/5P2/4PK2/8 w - - 0 1",
    solution: ["Rg8#"]
  },
  {
    order: 39,
    fen: "2q4k/4N1bp/8/4N3/8/p7/8/7K w - - 0 1",
    solution: ["Nf7#"]
  },
  {
    order: 40,
    fen: "7r/4p1nk/1pp2p2/2np4/4N2P/P2B2P1/1PPB4/1K6 w - - 0 1",
    solution: ["Nxf6#"]
  },
  {
    order: 41,
    fen: "1k1r4/pr6/1N3p2/4N1p1/3P3p/6BP/5PP1/7K w - - 0 1",
    solution: ["Nc6#"]
  },
  {
    order: 42,
    fen: "5n2/p1pp1pk1/1p5p/4R3/7q/P7/1BB2PPP/6K1 w - - 0 1",
    solution: ["Rg5#"]
  },
  {
    order: 43,
    fen: "2Qqkb2/p2npppp/1p6/8/BP6/2P3N1/3P1PPP/4K3 w - - 0 1",
    solution: ["Bxd7#"]
  },
  {
    order: 44,
    fen: "r2q1b1r/ppp1kBpp/3p4/4N3/3P4/8/PPP2PPP/R1BbK2R w KQ - 0 1",
    solution: ["Bg5#"]
  },
  {
    order: 45,
    fen: "rnbq1bnr/pppp1kP1/7p/4Q3/5P2/8/PPPP2PP/RNB1KBNR w KQ - 0 1",
    solution: ["gxh8=N#"]
  },
  {
    order: 46,
    fen: "6k1/p4qpp/1p6/8/8/1Q5P/r4PP1/4R1K1 w - - 0 1",
    solution: ["Re8#"]
  },
  {
    order: 47,
    fen: "5Nnk/6p1/3N3p/8/1p5P/1n4P1/5P1K/8 w - - 0 1",
    solution: ["Nf7#"]
  },
  {
    order: 48,
    fen: "3r2r1/7k/5Pp1/3R4/8/3B2P1/6K1/8 w - - 0 1",
    solution: ["Rh5#"]
  },
  {
    order: 49,
    fen: "8/8/5R2/2k1N1R1/3n1n2/2r1N1K1/5r2/8 w - - 0 1",
    solution: ["Nd3#"]
  },
  {
    order: 50,
    fen: "2k5/2r3pp/1pQ1Pq2/1ppp4/8/1P6/P4PPP/3R2K1 w - - 0 1",
    solution: ["Qa8#"]
  },
  {
    order: 51,
    fen: "8/1Q2p2p/2Npkbp1/5p2/5P2/6P1/7r/3K4 w - - 0 1",
    solution: ["Nd8#"]
  },
  {
    order: 52,
    fen: "3B4/1p6/2p5/6Qp/p7/5q1k/P4P2/3R1K2 w - - 0 1",
    solution: ["Qh4#"]
  },
  {
    order: 53,
    fen: "8/4r3/2nN3p/BR6/2pkp3/P2n2P1/6BP/6K1 w - - 0 1",
    solution: ["Nf5#"]
  },
  {
    order: 54,
    fen: "3bkr2/R5p1/4N1Pp/8/7q/7P/7K/3B4 w - - 0 1",
    solution: ["Nxg7#"]
  },
  {
    order: 55,
    fen: "4r1k1/5Rpp/8/1P3Q2/P4P2/1B6/2P2PKP/4q3 w - - 0 1",
    solution: ["Rf8#"]
  },
  {
    order: 56,
    fen: "8/1p6/p3pR2/4R3/4b3/2B1kp1P/PP2r1P1/6K1 w - - 0 1",
    solution: ["Rxf3#"]
  },
  {
    order: 57,
    fen: "3r1rk1/pR5p/5p2/1p3Pn1/4B2Q/4q3/8/6RK w - - 0 1",
    solution: ["Qxh7#"]
  },
  {
    order: 58,
    fen: "1r1k4/2R4R/8/8/8/6pP/PPP4q/K1B5 w - - 0 1",
    solution: ["Bg5+", "Ke8", "Rh8#"]
  },
  {
    order: 59,
    fen: "3qr1k1/pp3pp1/2p1b3/4P3/8/2PQ4/PPB2PP1/4K2R w K - 0 1",
    solution: ["Rh8+", "Kxh8", "Qh7#"]
  },
  {
    order: 60,
    fen: "r2q1r2/pp2np2/1bp4p/3p2pk/1P1N2b1/2PB2B1/P5PP/R2QK2R w KQ - 0 1",
    solution: ["Qxg4+", "Kxg4", "Be2#"]
  },
  {
    order: 61,
    fen: "3R4/2q3nk/7p/5P2/6PP/P7/1P1Q4/1K6 w - - 0 1",
    solution: ["Qxh6+", "Kxh6", "Rh8#"]
  },
  {
    order: 62,
    fen: "1r5r/ppq1n1k1/3p1ppp/3B1b2/2P2P2/1R2B3/PQ4PP/1R4K1 w - - 0 1",
    solution: ["Qxf6+", "Kxf6", "Bd4#"]
  },
  {
    order: 63,
    fen: "2q2r1k/p3b1pp/8/6N1/8/1Q6/B4PPP/7K w - - 0 1",
    solution: ["Qg8+", "Rxg8", "Nf7#"]
  },
  {
    order: 64,
    fen: "1rn5/7p/p3P1pk/4QR2/2r5/P1P5/KP2p1NP/2q5 w - - 0 1",
    solution: ["Rh5+", "gxh5", "Qf6#"]
  },
  {
    order: 65,
    fen: "6R1/5b1p/6pk/5pn1/3N1PP1/8/6PP/7K w - - 0 1",
    solution: ["Nxf5+", "gxf5", "fxg5#"]
  },
  {
    order: 66,
    fen: "5rk1/7p/1prN2p1/1b6/q7/5P2/PBQ3P1/K6R w - - 0 1",
    solution: ["Qxg6+", "hxg6", "Rh8#"]
  },
  {
    order: 67,
    fen: "4kb2/rppn1ppp/2N5/4pP1q/P7/1P4QP/2B3P1/3R2K1 w - - 0 1",
    solution: ["Qxe5+", "Nxe5", "Rd8#"]
  },
  {
    order: 68,
    fen: "5k2/q2r4/4RP1p/5P1P/p7/1B6/P7/K5R1 w - - 0 1",
    solution: ["Re8+", "Kxe8", "Rg8#"]
  },
  {
    order: 69,
    fen: "r1r1n1k1/4RRp1/1Bp3Q1/3p4/2P4p/1P4PP/Pq4B1/7K w - - 0 1",
    solution: ["Rf8+", "Kxf8", "Qf7#"]
  },
  {
    order: 70,
    fen: "5r1k/4qp1p/3p3Q/4n3/4N3/7P/1B4P1/7K w - - 0 1",
    solution: ["Nf6", "Qxf6", "Qxf8#"]
  },
  {
    order: 71,
    fen: "1b4k1/r5np/1p5B/p1p5/2q3P1/7P/8/4QRK1 w - - 0 1",
    solution: ["Qe8+", "Nxe8", "Rf8#"]
  },
  {
    order: 72,
    fen: "1r1k4/2R4R/8/8/6P1/6pP/PPP2p1q/K4B2 w - - 0 1",
    solution: ["Rcg7", "Qg1", "Rh8#"]
  },
  {
    order: 73,
    fen: "5k2/1b2Rp1p/6p1/5q1P/BB4N1/8/PPP2PP1/1K6 w - - 0 1",
    solution: ["Re8+", "Kg7", "h6#"]
  },
  {
    order: 74,
    fen: "r2q3k/pppb1Q1p/3p1b1p/8/2B5/8/PP3PPP/4R1K1 w - - 0 1",
    solution: ["Re8+", "Bxe8", "Qg8#"]
  },
  {
    order: 75,
    fen: "6R1/p4p2/1p2q2p/8/6Pk/8/PP2r1PK/3Q4 w - - 0 1",
    solution: ["Qe1+", "Rxe1", "g3#"]
  },
  {
    order: 76,
    fen: "qn5k/p5pp/5p2/8/7n/1BB5/5QPP/2K5 w - - 0 1",
    solution: ["Qxf6", "gxf6", "Bxf6#"]
  },
  {
    order: 77,
    fen: "2rr4/1b1n1p1k/3Pq1p1/8/p2Bp1P1/1N2R3/1PP2R1P/6K1 w - - 0 1",
    solution: ["Rh3+", "Kg8", "Rh8#"]
  },
  {
    order: 78,
    fen: "2r1nr1k/pp1q1p1p/3bpp2/5P2/1P1Q4/P3P3/1B3P1P/R3K1R1 w Q - 0 1",
    solution: ["Qxf6+", "Nxf6", "Bxf6#"]
  },
  {
    order: 79,
    fen: "r1bqr2k/pppp1Qpn/2n5/2b1p1P1/2B1P3/2PP4/PP3PP1/RN2K2R w KQ - 0 1",
    solution: ["Rxh7+", "Kxh7", "Qh5#"]
  },
  {
    order: 80,
    fen: "3n1qk1/2N2p1p/4b2r/2Q5/1R5r/B7/5PPP/7K w - - 0 1",
    solution: ["Rg4+", "Rxg4", "Qxf8#"]
  },
  {
    order: 81,
    fen: "kbK5/pp6/1P6/8/8/8/8/R7 w - - 0 1",
    solution: ["Ra6", "bxa6", "b7#"]
  },
  {
    order: 82,
    fen: "r2kq2r/p3bp1p/2p2Q2/1b1p2B1/8/2N4B/PP6/R5K1 w - - 0 1",
    solution: ["Qd6+", "Qd7", "Qxd7#"]
  },
  {
    order: 83,
    fen: "8/8/8/6N1/4N3/8/3n4/4k1K1 w - - 0 1",
    solution: ["Nc3", "Nf3+", "Nxf3#"]
  },
  {
    order: 84,
    fen: "r2n1k1r/ppp1n2p/4QN2/4p1N1/3b4/q7/P4PPP/R3R1K1 w - - 0 1",
    solution: ["Qf7+", "Nxf7", "Ne6#"]
  },
  {
    order: 85,
    fen: "1q4k1/3pp2b/4n1NQ/5N2/8/8/6PP/7K w - - 0 1",
    solution: ["Qg7+", "Nxg7", "Nh6#"]
  },
  {
    order: 86,
    fen: "2B5/2p5/2P5/p7/k1K5/8/1P2p3/8 w - - 0 1",
    solution: ["Ba6", "e1=Q", "Bb5#"]
  },
  {
    order: 87,
    fen: "3rkr2/1p3p2/b1n2Qpb/7p/P3N2B/1B6/1P1q1PPP/1K5R w - - 0 1",
    solution: ["Qe7+", "Nxe7", "Nf6#"]
  },
  {
    order: 88,
    fen: "r6k/n2R4/8/8/4N3/5p2/5K2/8 w - - 0 1",
    solution: ["Nf6", "Rf8", "Rh7#"]
  },
  {
    order: 89,
    fen: "rq5k/6pp/8/4p3/3p1N2/1B6/PPP5/1KR5 w - - 0 1",
    solution: ["Ng6+", "hxg6", "Rh1#"]
  },
  {
    order: 90,
    fen: "2kr4/pp1rb3/b1p5/8/7p/P5BP/P1P3Q1/KR6 w - - 0 1",
    solution: ["Qxc6+", "bxc6", "Rb8#"]
  },
  {
    order: 91,
    fen: "2kr2nr/pp1n1ppp/2p1p3/8/1P1P1B2/2N2Q1P/1PPKBPP1/7q w - - 0 1",
    solution: ["Qxc6+", "bxc6", "Ba6#"]
  },
  {
    order: 92,
    fen: "2kr1b1r/1p1N2p1/4Q3/pB1p3p/P2q1B1P/2N5/1PP2P2/2K4R w - - 0 1",
    solution: ["Nc5+", "Rd7", "Qxd7#"]
  },
  {
    order: 93,
    fen: "1kr5/2p5/1p6/5Pq1/B4pP1/8/3P4/R1K5 w - - 0 1",
    solution: ["Bc6", "f3", "Ra8#"]
  },
  {
    order: 94,
    fen: "rrb5/1p3p1k/1NnB1Qpp/8/6P1/5P2/2p3K1/8 w - - 0 1",
    solution: ["Bf8", "c1=Q", "Qg7#"]
  },
  {
    order: 95,
    fen: "5n2/P6R/1k6/1P6/3P4/1KN3r1/3p4/8 w - - 0 1",
    solution: ["a8=N+", "Ka5", "Ra7#"]
  },
  {
    order: 96,
    fen: "1r3nk1/7p/6p1/3N1p2/4b2B/8/Bp4PP/7K w - - 0 1",
    solution: ["Ne7+", "Kh8", "Bf6#"]
  },
  {
    order: 97,
    fen: "5r1k/p2R1p1p/1p3N2/4rn2/6R1/P6P/1P4PK/8 w - - 0 1",
    solution: ["Rxf7", "Rxf7", "Rg8#"]
  },
  {
    order: 98,
    fen: "r2qkr2/p2nb1Qp/bp2P3/3p1Np1/8/8/PPP2PPP/1N2K2R w Kq - 0 1",
    solution: ["Qg6+", "hxg6", "Ng7#"]
  },
  {
    order: 99,
    fen: "2bq1nkb/2p4p/2pp3Q/r4NpN/p2PP3/2P5/PP4PP/5RK1 w - - 0 1",
    solution: ["Qe6+", "Bxe6", "Nh6#"]
  },
  {
    order: 100,
    fen: "1bk5/1p1rRpp1/pBp2n2/7q/8/7P/3Q2P1/7K w - - 0 1",
    solution: ["Qxd7+", "Nxd7", "Re8#"]
  },
  {
    order: 101,
    fen: "1k4rq/1p1p4/p2Pp3/4P3/8/4QB2/6PP/5K2 w - - 0 1",
    solution: ["Qb6", "Qxe5", "Qxb7#"]
  },
  {
    order: 102,
    fen: "r7/npp5/k7/8/KPp5/3q4/5Q2/6B1 w - - 0 1",
    solution: ["Qxa7+", "Rxa7", "b5#"]
  },
  {
    order: 103,
    fen: "8/3R4/1k6/1pN5/4b3/1N3q2/5P1P/3R2K1 w - - 0 1",
    solution: ["R1d6+", "Bc6", "Rb7#"]
  },
  {
    order: 104,
    fen: "8/8/7p/2p1K1pk/1pP4p/pP5P/P7/8 w - - 0 1",
    solution: ["Kf5", "g4", "hxg4#"]
  },
  {
    order: 105,
    fen: "1k6/3K4/P7/3B4/8/B5n1/3n1p2/8 w - - 0 1",
    solution: ["Bc5", "f1=Q", "a7#"]
  },
  {
    order: 106,
    fen: "6k1/pr3p1p/8/4P1B1/8/2n5/P5RP/K7 w - - 0 1",
    solution: ["Be7+", "Kh8", "Bf6#"]
  },
  {
    order: 107,
    fen: "1B6/2pp4/3k4/1P6/2K1R3/8/p6p/8 w - - 0 1",
    solution: ["Ba7", "a1=Q", "Bc5#"]
  },
  {
    order: 108,
    fen: "6k1/pp2q2p/2b4Q/6N1/8/8/PP1r2PP/5RK1 w - - 0 1",
    solution: ["Rf8+", "Qxf8", "Qxh7#"]
  },
  {
    order: 109,
    fen: "3q2kr/1p3p1p/5b1B/3N4/2P5/8/5KP1/4Q3 w - - 0 1",
    solution: ["Qe8+", "Qxe8", "Nxf6#"]
  },
  {
    order: 110,
    fen: "2Rr3k/2R4p/4p3/q2rp3/8/7P/1PP4Q/1K6 w - - 0 1",
    solution: ["Qxe5+", "Rxe5", "Rxd8#"]
  },
  {
    order: 111,
    fen: "2b2k1r/1p3pp1/5N2/q3N3/8/7P/1P2Q1P1/1K6 w - - 0 1",
    solution: ["Ng6+", "fxg6", "Qe8#"]
  },
  {
    order: 112,
    fen: "6R1/4qp1p/ppr1n1pk/8/1P4QP/6N1/P4PP1/6K1 w - - 0 1",
    solution: ["Qh5+", "gxh5", "Nf5#"]
  },
  {
    order: 113,
    fen: "r4Br1/p1q2p1k/1p1R2p1/3pP2b/7Q/2p5/P1P1NPPP/6K1 w - - 0 1",
    solution: ["Qxh5+", "gxh5", "Rh6#"]
  },
  {
    order: 114,
    fen: "4rk2/5pp1/1p6/b2R2B1/1q6/8/P3QPP1/5K2 w - - 0 1",
    solution: ["Qxe8+", "Kxe8", "Rd8#"]
  },
  {
    order: 115,
    fen: "4N3/1q6/6b1/2pk1n2/2N5/4P3/2Q1K3/8 w - - 0 1",
    solution: ["Qe4+", "Kxe4", "Nf6#"]
  },
  {
    order: 116,
    fen: "kr1q4/nb1N4/8/8/8/6Q1/PP6/1K5R w - - 0 1",
    solution: ["Qxb8+", "Qxb8", "Nb6#"]
  },
  {
    order: 117,
    fen: "r1r5/ppp2kp1/3pNB2/3P1p2/2P1pP2/1P2Pq2/P2Q3K/2R3R1 w - - 0 1",
    solution: ["Rxg7+", "Kxf6", "Qd4#"]
  },
  {
    order: 118,
    fen: "R3K2k/7p/6P1/8/2p5/8/P5q1/8 w - - 0 1",
    solution: ["Kf7+", "Qxa8", "g7#"]
  },
  {
    order: 119,
    fen: "r1rR4/5Qqk/p5pp/1p6/8/P6P/5PPK/4R3 w - - 0 1",
    solution: ["Re7", "Qxf7", "Rxf7#"]
  },
  {
    order: 120,
    fen: "3rk2r/p1qn1pp1/1p2pb1p/7P/2Pp4/B1P1QP2/P1B1KP2/4R2R w k - 0 1",
    solution: ["Qxe6+", "fxe6", "Bg6#"]
  },
  {
    order: 121,
    fen: "2rkr3/R7/3Bb3/2p1N1p1/8/8/1P4P1/6K1 w - - 0 1",
    solution: ["Rd7+", "Bxd7", "Nf7#"]
  },
  {
    order: 122,
    fen: "4b1k1/8/5PP1/8/3B4/1pp5/2q5/K6R w - - 0 1",
    solution: ["Rh8+", "Kxh8", "f7#"]
  },
  {
    order: 123,
    fen: "1Q6/5kpn/5bN1/7P/8/2q4B/6PP/7K w - - 0 1",
    solution: ["Qg8+", "Kxg8", "Be6#"]
  },
  {
    order: 124,
    fen: "1q5k/2Q1R1pp/p7/3p4/P1p5/6R1/1r2r1PK/8 w - - 0 1",
    solution: ["Re8+", "Qxe8", "Qxg7#"]
  },
  {
    order: 125,
    fen: "5K1k/6p1/5b1n/4N3/3qBQ2/8/8/8 w - - 0 1",
    solution: ["Qxh6+", "gxh6", "Nf7#"]
  },
  {
    order: 126,
    fen: "4R2r/1r1qQbk1/3P1p1p/2B2Pp1/6P1/5P2/5RK1/8 w - - 0 1",
    solution: ["Qxf6+", "Kxf6", "Bd4#"]
  },
  {
    order: 127,
    fen: "2r2rk1/2q2p1p/5RpQ/7P/8/1P6/PBP5/1K6 w - - 0 1",
    solution: ["Qg7+", "Kxg7", "Rxg6#"]
  },
  {
    order: 128,
    fen: "1krr4/p1p3b1/p1B5/3N4/8/8/KP4p1/8 w - - 0 1",
    solution: ["Nb4", "g1=Q", "Nxa6#"]
  },
  {
    order: 129,
    fen: "r3rk2/pp1q1p2/4bBp1/3p4/5R2/8/8/6K1 w - - 0 1",
    solution: ["Rh4", "Rec8", "Rh8#"]
  },
  {
    order: 130,
    fen: "k3r3/p3bpp1/1pN4p/2p5/8/8/8/1K1R4 w - - 0 1",
    solution: ["Rd7", "Rd8", "Rxa7#"]
  },
  {
    order: 131,
    fen: "4k3/2R3p1/4N3/3P4/4b1r1/2K1p3/5p2/8 w - - 0 1",
    solution: ["d6", "f1=Q", "Re7#"]
  },
  {
    order: 132,
    fen: "8/2Q5/2n1qkp1/p6p/1pPpP1P1/1P1N1K2/P7/8 w - - 0 1",
    solution: ["g5+", "Kxg5", "Qf4#"]
  },
  {
    order: 133,
    fen: "8/4q3/8/bp6/pk6/1np1N3/1Q6/1K6 w - - 0 1",
    solution: ["Qa3+", "Kxa3", "Nc2#"]
  },
  {
    order: 134,
    fen: "r7/5R2/6N1/4p3/2K1k3/4r3/7P/3R4 w - - 0 1",
    solution: ["Rd4+", "exd4", "Rf4#"]
  },
  {
    order: 135,
    fen: "7k/pp4np/2p3p1/3pN1q1/3P4/Q7/1r3rPP/2R2RK1 w - - 0 1",
    solution: ["Qf8+", "Rxf8", "Rxf8#"]
  },
  {
    order: 136,
    fen: "3r4/7p/6B1/8/2N2pp1/5k2/3P1P2/b4K2 w - - 0 1",
    solution: ["d4", "Rxd4", "Ne5#"]
  },
  {
    order: 137,
    fen: "q1B4k/6pp/8/2p5/2P2N2/1P5R/3r4/1K6 w - - 0 1",
    solution: ["Ng6+", "Kg8", "Be6#"]
  },
  {
    order: 138,
    fen: "2Q2n2/2R4p/1p1qpp1k/8/3P2PP/3B4/5PK1/r1r5 w - - 0 1",
    solution: ["Qxf8+", "Qxf8", "Rxh7#"]
  },
  {
    order: 139,
    fen: "r1q3k1/4Q1Pb/1n2p2B/4P2p/1p4p1/2p1K1P1/1P4N1/3R4 w - - 0 1",
    solution: ["Rd8+", "Qxd8", "Qxe6#"]
  },
  {
    order: 140,
    fen: "4rn2/4pkb1/1qppnp2/1p3N1b/p7/2PB2Q1/1B4PP/2R1R2K w - - 0 1",
    solution: ["Qxg7+", "Nxg7", "Nh6#"]
  },
  {
    order: 141,
    fen: "r3rk2/2bb1p1p/1pN3p1/p7/8/2B1Q2P/PP3PP1/5K2 w - - 0 1",
    solution: ["Qh6+", "Kg8", "Qg7#"]
  },
  {
    order: 142,
    fen: "6rr/8/2qp1B2/2p5/1pP1k1p1/1P2P3/1K1P3p/5R2 w - - 0 1",
    solution: ["Kc2", "h1=Q", "Rf4#"]
  },
  {
    order: 143,
    fen: "2r5/pp1kP3/6q1/3PQ3/2P5/6B1/6p1/6K1 w - - 0 1",
    solution: ["e8=Q+", "Qxe8", "Qd6#"]
  },
  {
    order: 144,
    fen: "1Q6/r5bk/2p3R1/p1qr1p2/2N1p3/1P6/1PP5/1K4R1 w - - 0 1",
    solution: ["Rh6+", "Bxh6", "Qg8#"]
  },
  {
    order: 145,
    fen: "1r6/p1p2B1p/3b2nk/8/6R1/1P1P3P/PBP1r3/6RK w - - 0 1",
    solution: ["Rh4+", "Nxh4", "Bg7#"]
  },
  {
    order: 146,
    fen: "r2q4/1b6/1p3p2/k3n3/pN6/2P5/3NQPPP/5RK1 w - - 0 1",
    solution: ["Nb3+", "axb3", "Ra1#"]
  },
  {
    order: 147,
    fen: "8/5KBk/6p1/6Pb/7R/8/8/4q3 w - - 0 1",
    solution: ["Rxh5+", "gxh5", "g6#"]
  },
  {
    order: 148,
    fen: "r6r/1p2bQ1p/p6k/2q3p1/6P1/P7/1PP5/1K3R1b w - - 0 1",
    solution: ["Rf6+", "Bxf6", "Qxf6#"]
  },
  {
    order: 149,
    fen: "3R1rk1/p5p1/1p4q1/n4pN1/7Q/2p4P/2P2P2/6K1 w - - 0 1",
    solution: ["Qh8+", "Kxh8", "Rxf8#"]
  },
  {
    order: 150,
    fen: "r1qr1kn1/p3b1pp/1p2Rn2/4N3/2Q5/2N5/PPP2PPP/R5K1 w - - 0 1",
    solution: ["Rxf6+", "Nxf6", "Qf7#"]
  },
  {
    order: 151,
    fen: "r1r3q1/8/1K1pR3/3N4/2k3N1/p7/2P5/8 w - - 0 1",
    solution: ["Re4+", "Kxd5", "Nf6#"]
  },
  {
    order: 152,
    fen: "1r2q3/1R6/3p1kp1/1ppBp1b1/p3Pp2/2PP4/PP3P2/5K1Q w - - 0 1",
    solution: ["Qh8+", "Qxh8", "Rf7#"]
  },
  {
    order: 153,
    fen: "8/8/R7/3nk3/1R4K1/1pPr4/8/8 w - - 0 1",
    solution: ["Re4+", "Kxe4", "Re6#"]
  },
  {
    order: 154,
    fen: "7n/4N1kp/3Q3p/2p3pP/3b2P1/1r6/1r1q4/K4RB1 w - - 0 1",
    solution: ["Qxh6+", "Kxh6", "Nf5#"]
  },
  {
    order: 155,
    fen: "5R2/5r1q/p4k2/1bP2p2/7r/P5Q1/1P3KP1/4R3 w - - 0 1",
    solution: ["Re6+", "Kxe6", "Qd6#"]
  },
  {
    order: 156,
    fen: "1brr1k2/2R3n1/4p2N/pB5N/4q3/8/3Q1P1K/8 w - - 0 1",
    solution: ["Qd6+", "Rxd6", "Rf7#"]
  },
  {
    order: 157,
    fen: "1q6/6NK/5p2/1r2r1kb/6pp/8/8/5R2 w - - 0 1",
    solution: ["Rf5+", "Rxf5", "Ne6#"]
  },
  {
    order: 158,
    fen: "6q1/3p4/4np2/2P1k3/7K/3PP3/8/1B3R2 w - - 0 1",
    solution: ["Rf5+", "Kxf5", "d4#"]
  },
  {
    order: 159,
    fen: "r4r1k/1b6/p4pPB/1p5Q/7K/1P3qP1/P6P/8 w - - 0 1",
    solution: ["Bg7+", "Kxg7", "Qh7#"]
  },
  {
    order: 160,
    fen: "2b2n1r/5N2/ppp3r1/7k/3P1R1p/5P1N/PP3K2/6R1 w - - 0 1",
    solution: ["Rf5+", "Bxf5", "Nf4#"]
  },
  {
    order: 161,
    fen: "3r2r1/pb1qb2k/4R1pB/1p5Q/3P4/2P5/P4PPP/6K1 w - - 0 1",
    solution: ["Bf8+", "gxh5", "Rh6#"]
  },
  {
    order: 162,
    fen: "1r6/2q2p1r/ppN1nkp1/3pR2p/b2B3P/2PP2P1/5PB1/1R4K1 w - - 0 1",
    solution: ["Rf5+", "Kxf5", "Bh3#"]
  },
  {
    order: 163,
    fen: "rnb1kr2/ppp1n1p1/1q2p3/6Np/5Q2/8/PPP2PPP/2KR1B1R w q - 0 1",
    solution: ["Qxf8+", "Kxf8", "Rd8#"]
  },
  {
    order: 164,
    fen: "2q3rk/6p1/8/6p1/R3Q3/7P/5PPK/8 w - - 0 1",
    solution: ["Qh4+", "gxh4", "Rxh4#"]
  },
  {
    order: 165,
    fen: "2n1b1r1/ppr2N1k/4PQp1/6Pp/3P4/P2B4/1P3KPP/n7 w - - 0 1",
    solution: ["Bxg6+", "Rxg6", "Qh8#"]
  },
  {
    order: 166,
    fen: "r2Nqb1r/pQ1bp1pp/1pn1p3/2kp4/P1p2B2/2P5/1PP2PPP/R3KB1R w KQ - 0 1",
    solution: ["Qxc6+", "Bxc6", "Nxe6#"]
  },
  {
    order: 167,
    fen: "4k2r/pPpn1ppp/1b6/3R2B1/8/8/PP3PPP/6K1 w k - 0 1",
    solution: ["b8=Q+", "Nxb8", "Rd8#"]
  },
  {
    order: 168,
    fen: "rnbq1b1r/pppp1Q1p/2k2p2/4p1p1/2B5/2P5/PPP2PPP/3RK2R w K - 0 1",
    solution: ["Qd5+", "Kb6", "Qb5#"]
  },
  {
    order: 169,
    fen: "r2b1k2/pp3p1p/2p3p1/7N/7q/8/PP1B4/2K1R2B w - - 0 1",
    solution: ["Bh6+", "Kg8", "Re8#"]
  },
  {
    order: 170,
    fen: "6r1/1R6/8/p5r1/kp6/7R/1P5P/7K w - - 0 1",
    solution: ["Ra3+", "bxa3", "b3#"]
  },
  {
    order: 171,
    fen: "3Q4/3p1p2/2b1k3/R7/4P3/4P3/K7/5r1q w - - 0 1",
    solution: ["Re5+", "Kd6", "Qb8#"]
  },
  {
    order: 172,
    fen: "5r2/6R1/7p/3Q4/6pk/8/5q1P/7K w - - 0 1",
    solution: ["Qg5+", "hxg5", "Rh7#"]
  },
  {
    order: 173,
    fen: "4r1k1/3p4/7K/3N4/2B5/8/8/8 w - - 0 1",
    solution: ["Ne7+", "Kf8", "Ng6#"]
  },
  {
    order: 174,
    fen: "2B4r/2K5/8/2pkp3/1p1b4/5R2/4P3/8 w - - 0 1",
    solution: ["e4+", "Kc4", "Ba6#"]
  },
  {
    order: 175,
    fen: "5kr1/6p1/q2b2B1/4n1B1/8/8/5P2/2RQ2K1 w - - 0 1",
    solution: ["Rc8+", "Qxc8", "Qxd6#"]
  },
  {
    order: 176,
    fen: "b1r1r3/pk3ppp/1p1Q4/8/4q3/4B3/1KP2PPP/R2R4 w - - 0 1",
    solution: ["Rxa7+", "Kxa7", "Qxb6#"]
  },
  {
    order: 177,
    fen: "7k/4qp1P/p5pQ/1p6/8/8/PPP1r3/2K4R w - - 0 1",
    solution: ["Qg7+", "Kxg7", "h8=Q#"]
  },
  {
    order: 178,
    fen: "2R5/p1R3b1/1q5k/4n1p1/4B3/6P1/7P/7K w - - 0 1",
    solution: ["Rh8+", "Bxh8", "Rh7#"]
  },
  {
    order: 179,
    fen: "4B3/6pk/4R2p/8/8/7P/2rr2PK/8 w - - 0 1",
    solution: ["Bg6+", "Kg8", "Re8#"]
  },
  {
    order: 180,
    fen: "8/R3Pr2/2nk4/8/3PK3/8/8/8 w - - 0 1",
    solution: ["e8=N+", "Ke6", "d5#"]
  },
  {
    order: 181,
    fen: "6rk/p1n3pp/3N2b1/3rP3/1P6/3R3R/5P2/1B4K1 w - - 0 1",
    solution: ["Rxh7+", "Bxh7", "Nf7#"]
  },
  {
    order: 182,
    fen: "r1b3k1/pp1p3p/3p2pB/8/q1P5/1P6/P5PP/4R1K1 w - - 0 1",
    solution: ["Rf1", "Qxc4", "Rf8#"]
  },
  {
    order: 183,
    fen: "4qrk1/1p4p1/b1p3Q1/5p1B/8/P5P1/1P3P1R/6K1 w - - 0 1",
    solution: ["Qh7+", "Kxh7", "Bf7#"]
  },
  {
    order: 184,
    fen: "2k2bnr/Qpp2ppp/q7/8/8/2N1Bn2/PP3PPP/2KR4 w - - 0 1",
    solution: ["Qb8+", "Kxb8", "Rd8#"]
  },
  {
    order: 185,
    fen: "4bkr1/6p1/1q5P/4N3/8/4R3/Q7/6K1 w - - 0 1",
    solution: ["Qf7+", "Bxf7", "Nd7#"]
  },
  {
    order: 186,
    fen: "r4rk1/ppp1qpp1/1bnp1B1p/6NQ/2BPP1b1/4n3/PP4PP/RN3RK1 w - - 0 1",
    solution: ["Qg6", "hxg5", "Qxg7#"]
  },
  {
    order: 187,
    fen: "6k1/8/3P4/1b1R1n2/8/8/8/4K3 b - - 0 1",
    solution: ["Bd7"]
  },
  {
    order: 188,
    fen: "r1bq1rk1/p1pnbppp/1p2p3/8/3P4/2NB4/PPP1QPPP/R1B1K2R w KQ - 0 1",
    solution: ["Qe4"]
  },
  {
    order: 189,
    fen: "6k1/8/8/1b1R1n2/8/8/6K1/8 b - - 0 1",
    solution: ["Bc6"]
  },
  {
    order: 190,
    fen: "6k1/5pp1/8/1p1r1r2/8/1R5P/4P1PK/1R6 w - - 0 1",
    solution: ["e4"]
  },
  {
    order: 191,
    fen: "1r4k1/p4p2/7R/8/6b1/8/B5PP/6K1 w - - 0 1",
    solution: ["Rg6+"]
  },
  {
    order: 192,
    fen: "r2q1rk1/1ppbb1pp/pnp1p3/4N3/8/8/PPP1QPPP/RNBR2K1 w - - 0 1",
    solution: ["Nxd7", "Nxd7", "Qxe6+", "Kh8", "Qxd7"]
  },
  {
    order: 193,
    fen: "3r3k/ppp3pp/1q6/n7/8/2B2P1P/PPB3P1/2Q4K w - - 0 1",
    solution: ["Bxg7+", "Kxg7", "Qg5+", "Kf7", "Qxd8"]
  },
  {
    order: 194,
    fen: "r2qk2r/p2p1ppp/1pbbp3/7n/2P1P3/P1N1B3/1PQ2PPP/R3KB1R w KQkq - 0 1",
    solution: ["Qd1", "Nf6", "Qxd6"]
  },
  {
    order: 195,
    fen: "5kn1/p1b1nppQ/1p6/4p3/r7/P6P/1P3PP1/5RK1 w - - 0 1",
    solution: ["Qc2"]
  },
  {
    order: 196,
    fen: "2r2rk1/ppq2ppp/2p5/8/3b4/3B3P/PPP1QPP1/R4RK1 w - - 0 1",
    solution: ["Qe4", "g6", "Qxd4"]
  },
  {
    order: 197,
    fen: "5rk1/pp2bppp/2pq4/8/8/2P2Q1P/PPB2PP1/4R2K w - - 0 1",
    solution: ["Qe4", "g6", "Qxe7"]
  },
  {
    order: 198,
    fen: "r2rnk2/5ppp/pp2P3/4P3/3N4/Pb4P1/1P3K1P/2RR4 w - - 0 1",
    solution: ["e7+", "Kxe7", "Nc6+", "Ke6", "Rxd8", "Rxd8", "Nxd8+"]
  },
  {
    order: 199,
    fen: "5rk1/5ppp/b1p1p3/2PnP3/1q1B4/6P1/4rP1P/1BQRR1K1 w - - 0 1",
    solution: ["Rxe2", "Bxe2", "Qc2", "g6", "Qxe2"]
  },
  {
    order: 200,
    fen: "r6k/2p2p1p/p5p1/p7/2r5/2P4P/1P3PP1/4Q1K1 w - - 0 1",
    solution: ["Qe5+", "Kg8", "Qd5", "Re8", "Qxc4"]
  },
  {
    order: 201,
    fen: "6k1/5pb1/1p1N3p/p5p1/5q2/Q6P/PPr5/3RR2K w - - 0 1",
    solution: ["Re8+", "Kh7", "Qd3+", "f5", "Qxc2"]
  },
  {
    order: 202,
    fen: "8/8/4np2/4pk1p/RNr4P/P3KP2/1P6/8 w - - 0 1",
    solution: ["Nd5", "Kg6", "Rxc4"]
  },
  {
    order: 203,
    fen: "2r2rk1/pbqnbppp/1p6/3Pp3/2p1P3/P1P2N2/1BB1QPPP/3RR1K1 w - - 0 1",
    solution: ["d6", "Qc5", "dxe7"]
  },
  {
    order: 204,
    fen: "r3k2r/pp2qppp/2p3b1/P2pP3/1b1P4/2N4P/1P1B1PP1/R2Q1RK1 w kq - 0 1",
    solution: ["Nxd5", "cxd5", "Qa4+", "Kd8", "Bxb4"]
  },
  {
    order: 205,
    fen: "2r3k1/4bppp/1r2p3/qb6/5B2/2N3R1/PP3PPP/2R1Q2K w - - 0 1",
    solution: ["Bc7", "Rxc7", "Qe5", "Bf8", "Qxc7"]
  },
  {
    order: 206,
    fen: "3r1q1k/p5b1/1r3p1p/1ppBpQpP/4P3/2P3P1/PP1R1PK1/3R4 w - - 0 1",
    solution: ["Bg8", "Qxg8", "Rxd8"]
  },
  {
    order: 207,
    fen: "4rbnk/2pq2pp/p2p1p2/1p1P2N1/1P1P4/4BQ1P/P4PP1/5RK1 w - - 0 1",
    solution: ["Qf5", "Qxf5", "Nf7#"]
  },
  {
    order: 208,
    fen: "7k/p2q2pp/2pP1p2/2r1p3/P7/7P/3Q1PP1/3R2K1 w - - 0 1",
    solution: ["Qb4", "Rd5", "Qb8+", "Qe8", "Qxe8#"]
  },
  {
    order: 209,
    fen: "r1b1r1k1/pp3p1p/5qpB/3p4/3b4/1Q4P1/PP3PBP/3R1RK1 w - - 0 1",
    solution: ["Qa4", "Rd8", "Qxd4"]
  },
  {
    order: 210,
    fen: "2r3k1/p2q1ppp/1p1b4/2p2N2/8/2PP4/PP2Q1PP/R6K w - - 0 1",
    solution: ["Qg4", "g6", "Nh6+", "Kg7", "Qxd7"]
  },
  {
    order: 211,
    fen: "r2r4/k4pp1/pp3q2/2pPR3/P7/2P1N2P/5PPQ/6K1 w - - 0 1",
    solution: ["Re6", "fxe6", "Qc7#"]
  },
  {
    order: 212,
    fen: "r2r2k1/pp1bqp2/4p1pp/nP6/4Q3/2PB1N2/P4PPP/R2R2K1 w - - 0 1",
    solution: ["Qb4", "Qxb4", "cxb4", "b6", "bxa5"]
  },
  {
    order: 213,
    fen: "r7/pp5k/2p1b1p1/8/7r/1PQ5/P5PP/5R1K w - - 0 1",
    solution: ["Qe1", "Rh5", "Qxe6"]
  },
  {
    order: 214,
    fen: "rn3q1k/1bp3pp/p7/3P4/2QP4/2NB4/PP4PP/2K1R3 w - - 0 1",
    solution: ["Qb4", "Qg8", "Qxb7"]
  },
  {
    order: 215,
    fen: "r7/8/p2R1rk1/1p3q1p/3Q3P/2P3P1/5P2/R5K1 w - - 0 1",
    solution: ["Rxf6+", "Qxf6", "Qe4+", "Kg7", "Qxa8"]
  },
  {
    order: 216,
    fen: "r4rk1/pQp2p1p/6p1/6N1/8/3PP1P1/4KP2/b7 w - - 0 1",
    solution: ["Qh1", "h5", "Qxa1"]
  },
  {
    order: 217,
    fen: "1r4k1/5p1p/6pB/8/8/4Q2P/qn3PK1/1R6 w - - 0 1",
    solution: ["Qe5", "f6", "Qxb8+"]
  },
  {
    order: 218,
    fen: "5r1k/1bQ3np/2p3p1/1pP1R3/1P6/1B3q2/1B3N2/5K2 w - - 0 1",
    solution: ["Rf5", "Rg8", "Rxf3"]
  },
  {
    order: 219,
    fen: "r1bq1r2/pp2Rpk1/6p1/3pb3/7Q/2PB4/P4PP1/RN3K2 w - - 0 1",
    solution: ["Qg5", "Bf6", "Qxg6+", "Kh8", "Qh7#"]
  },
  {
    order: 220,
    fen: "r4rk1/1p3pbp/1n1pq3/p5P1/3P4/1PN1BQ1R/1P5P/R6K w - - 0 1",
    solution: ["d5", "Nxd5", "Nxd5"]
  },
  {
    order: 221,
    fen: "r4rk1/pp3ppp/2pb1n2/q7/8/P4QP1/1PPN1PBP/3R1RK1 w - - 0 1",
    solution: ["Nc4", "Qc7", "Nxd6"]
  },
  {
    order: 222,
    fen: "3r2k1/5ppp/bn6/ppp2N2/3Pq3/P1P5/1B1Q2PP/2R3K1 w - - 0 1",
    solution: ["Qg5", "g6", "Qxd8+", "Qe8", "Qxe8#"]
  },
  {
    order: 223,
    fen: "1rr3k1/4qppp/pn6/1pp1n2b/4P3/P1PP2QP/2B3PN/R1B2RK1 w - - 0 1",
    solution: ["Rf5", "Bg6", "Rxe5"]
  },
  {
    order: 224,
    fen: "6kr/np1pp3/2q5/p7/8/5PN1/PPP3P1/1K1Q3R w - - 0 1",
    solution: ["Rxh8+", "Kxh8", "Qd4+", "Kg8", "Qxa7"]
  },
  {
    order: 225,
    fen: "r3k2r/ppqn1ppp/2nbp3/1Bpp4/Q2P2b1/2P1PN2/PP1N1PPP/R1B2RK1 w kq - 0 1",
    solution: ["dxc5", "Nxc5", "Qxg4"]
  },
  {
    order: 226,
    fen: "5rk1/5ppp/1qp2n2/3p1b2/4p3/1NP1P1P1/5PBP/1R1Q2K1 w - - 0 1",
    solution: ["Nd4", "Qc7", "Nxf5"]
  },
  {
    order: 227,
    fen: "5rk1/5ppp/1q6/4p3/2r4P/1NP1P1Pb/5P2/1RRQ2K1 w - - 0 1",
    solution: ["Nd2", "Qc6"]
  },
  {
    order: 228,
    fen: "r1bq1rk1/ppp2ppp/8/2n3PQ/3pP3/P7/1PP2PBP/3RK1NR w K - 0 1",
    solution: ["g6", "hxg6", "Qxc5"]
  },
  {
    order: 229,
    fen: "2r3k1/3q2bp/1p2p1p1/4n3/3Np3/B1P1P1P1/1P2QP2/3R2K1 w - - 0 1",
    solution: ["Nf5", "Qb7", "Ne7+", "Kh8", "Nxc8"]
  },
  {
    order: 230,
    fen: "R7/P7/2K5/8/2k5/8/8/r7 w - - 0 1",
    solution: ["Rc8", "Rxa7", "Kb6+", "Kd4", "Kxa7"]
  },
  {
    order: 231,
    fen: "2rr2k1/p4bpp/5p2/1qBn4/3p2Q1/P5P1/5PBP/2R2RK1 w - - 0 1",
    solution: ["Bf8", "Rxf8", "Rxc8", "Rxc8", "Qxc8+"]
  },
  {
    order: 232,
    fen: "1R3b2/3p1k1p/6r1/5q2/5B2/5Q2/6PP/6K1 w - - 0 1",
    solution: ["Rxf8+", "Kxf8", "Bd6+", "Rxd6", "Qxf5+"]
  },
  {
    order: 233,
    fen: "r3r1k1/1p1q1pp1/p1pb4/6Np/3PR2P/PP1Q2P1/1B3PK1/8 w - - 0 1",
    solution: ["Re7", "g6", "Rxd7"]
  },
  {
    order: 234,
    fen: "r1b2rk1/2p1qnbp/p1pp2p1/5p2/2PQP3/1PN2N1P/PB3PP1/3R1RK1 w - - 0 1",
    solution: ["Nd5", "Ne5", "Nxe7+"]
  },
  {
    order: 235,
    fen: "r4rk1/1p1qnppp/p2p1b2/3P1N2/8/5Q2/PP3PPP/R1B1R1K1 w - - 0 1",
    solution: ["Rxe7", "Bxe7", "Qg4", "g6", "Nh6+", "Kg7", "Qxd7"]
  },
  {
    order: 236,
    fen: "2Q4r/5ppk/7p/8/4N3/3q3P/5PP1/6K1 w - - 0 1",
    solution: ["Qf5+", "g6", "Nf6+", "Kg7", "Qxd3"]
  },
  {
    order: 237,
    fen: "r1b3rk/p3q1pp/2pR4/5p2/5N2/Q5PP/PP3P2/3R2K1 w - - 0 1",
    solution: ["Rh6", "gxh6", "Qxe7"]
  },
  {
    order: 238,
    fen: "8/3q4/7p/6p1/r4pk1/1pQB4/1P2PP1K/8 w - - 0 1",
    solution: ["Bb5", "Kh5", "Bxd7"]
  },
  {
    order: 239,
    fen: "r5rk/n2R2pp/4p3/qN4Q1/5p2/8/P1b2PPP/5RK1 w - - 0 1",
    solution: ["Nd6", "Qf5", "Nxf5"]
  },
  {
    order: 240,
    fen: "2kr2nr/1ppq2pp/p1pB4/8/6Q1/8/PP3PPP/RN1R2K1 w - - 0 1",
    solution: ["Be7", "Nxe7", "Rxd7"]
  },
  {
    order: 241,
    fen: "3rk1r1/5p1p/p2p1bp1/3Qn3/N3P3/1P3B2/P1q3PP/R4R1K w - - 0 1",
    solution: ["Bd1", "Qc6", "Rxf6"]
  },
  {
    order: 242,
    fen: "3rn3/pp1q1rbR/3k4/2p1pP1Q/3pP3/P2P1N2/1PP5/6RK w - - 0 1",
    solution: ["f6", "Nxf6", "Qxe5+", "Kc6", "Rhxg7", "Rxg7", "Qxf6+"]
  },
  {
    order: 243,
    fen: "3r1k2/ppqnrpp1/2pNpn1p/2P4P/3P1B2/3R2R1/PP2QPP1/1K6 w - - 0 1",
    solution: ["Rxg7", "Kxg7", "Nf5+", "Kf8", "Bxc7"]
  },
  {
    order: 244,
    fen: "2R2bk1/3r3p/4ppp1/7n/8/8/3B1PPP/3R1K2 w - - 0 1",
    solution: ["Rxf8+", "Kxf8", "Bh6+", "Ke8", "Rxd7", "Kxd7", "g4"]
  },
  {
    order: 245,
    fen: "1kr5/ppp5/2nP1qp1/5p2/P2R3p/1P3Q1P/1BP3P1/7K w - - 0 1",
    solution: ["Qxc6", "bxc6", "Rb4+", "Ka8", "Bxf6"]
  },
  {
    order: 246,
    fen: "4rbk1/pq4pp/1p3p2/3b1Q2/1P1P4/5NP1/5PBP/1R4K1 w - - 0 1",
    solution: ["Ng5", "fxg5", "Bxd5+"]
  },
  {
    order: 247,
    fen: "2r3k1/b1N1npp1/7p/3p4/3P4/1N2P3/1P1K4/2R5 w - - 0 1",
    solution: ["Nxd5", "Rxc1", "Nxe7+", "Kf8", "Ng6+", "fxg6", "Kxc1"]
  },
  {
    order: 248,
    fen: "1r4k1/pQp2ppp/n7/2q2b2/8/6P1/PB1PPP2/1R2K2R w K - 0 1",
    solution: ["Qxb8+", "Nxb8", "Ba3", "Qb6", "Rxb6"]
  },
  {
    order: 249,
    fen: "r4rk1/2bn1pp1/p1bqp1p1/2NpN1B1/3P4/8/PP3PPP/2RQR1K1 w - - 0 1",
    solution: ["Ne4", "dxe4", "Rxc6", "Qd5", "Rxc7"]
  },
  {
    order: 250,
    fen: "2r2rn1/pp3p1p/5qpk/2p1Q3/3pPNP1/3P1R2/PPP4P/R5K1 w - - 0 1",
    solution: ["Ne6", "fxe6", "Rxf6"]
  },
  {
    order: 251,
    fen: "r3r1k1/p3npp1/bb2p2p/3pN2n/P2P2P1/1P2QN1q/1B3P2/1BR1R1K1 w - - 0 1",
    solution: ["Ng5", "hxg5", "Qxh3"]
  },
  {
    order: 252,
    fen: "7k/8/4qpp1/8/5K2/7N/8/7R w - - 0 1",
    solution: ["Ng5+", "Kg7", "Nxe6+"]
  },
  {
    order: 253,
    fen: "k7/pR6/8/2p5/8/8/6B1/K1q5 w - - 0 1",
    solution: ["Rb1#"]
  },
  {
    order: 254,
    fen: "k7/1R6/p1B5/1np4q/1b6/8/8/K7 w - - 0 1",
    solution: ["Rxb5+", "Ka7", "Rb7+", "Ka8", "Rxb4+", "Ka7", "Rb7+", "Ka8", "Rh7+", "Kb8", "Rxh5"]
  },
  {
    order: 255,
    fen: "8/8/3b4/3p4/2k1PR2/8/3K4/8 w - - 0 1",
    solution: ["e5+", "Kc5", "exd6"]
  },
  {
    order: 256,
    fen: "1B6/6r1/8/4K3/8/2P3k1/8/8 w - - 0 1",
    solution: ["Kf6+", "Kf3", "Kxg7"]
  },
  {
    order: 257,
    fen: "K7/8/2B5/3N4/8/8/8/1q5k w - - 0 1",
    solution: ["Nc3+", "Kg1", "Nxb1"]
  },
  {
    order: 258,
    fen: "7k/6q1/8/8/7B/8/8/K6R w - - 0 1",
    solution: ["Bf6+", "Kg8", "Bxg7"]
  },
  {
    order: 259,
    fen: "8/4r3/1B1p4/2P3K1/8/4k3/8/8 w - - 0 1",
    solution: ["cxd6+", "Kd3", "dxe7"]
  },
  {
    order: 260,
    fen: "r6r/1p4p1/2k1bp2/p2p3p/Rb1PpB1P/1PN1P3/1P1K1PP1/2R5 w - - 0 1",
    solution: ["Rxb4", "axb4", "Nxd5+", "Kd7", "Nb6+", "Ke7", "Rc7+", "Kd8", "Nxa8"]
  },
  {
    order: 261,
    fen: "4r3/pb4k1/1p3Rp1/3p4/3B4/2P5/P2K2PP/8 w - - 0 1",
    solution: ["Rxb6+", "Kf7", "Rxb7+"]
  },
  {
    order: 262,
    fen: "4R3/6rk/3p2r1/p2q3p/P2B4/2P4P/1P1Q2P1/6K1 w - - 0 1",
    solution: ["Rh8+", "Kxh8", "Bxg7+", "Rxg7", "Qxd5"]
  },
  {
    order: 263,
    fen: "2q2r2/R1P4k/6pp/1pQ5/1P3P2/8/6PP/6K1 w - - 0 1",
    solution: ["Qxf8", "Qxf8", "c8=Q+"]
  },
  {
    order: 264,
    fen: "r4rk1/pp1qn1bp/4pp2/3p4/5P1N/2PQBP2/PP3K2/6RR w - - 0 1",
    solution: ["Qxh7+", "Kxh7", "Nf5+", "Bh6", "Rxh6#"]
  },
  {
    order: 265,
    fen: "1r4k1/q3bpp1/p2p3p/8/3n4/1N1B3P/PP2QPP1/3R2K1 w - - 0 1",
    solution: ["Nxd4", "Qxd4", "Bh7+", "Kxh7", "Rxd4"]
  },
  {
    order: 266,
    fen: "r4r2/3q4/2p3kp/2Pn2p1/4N3/6N1/6PP/1Q2R1K1 w - - 0 1",
    solution: ["Nf6+", "Kxf6", "Nh5+", "Kf7", "Qh7#"]
  },
  {
    order: 267,
    fen: "1r3r2/4pp1k/4B1pB/n2Pp3/2q4Q/8/6PP/5RK1 w - - 0 1",
    solution: ["Bxf8+", "Qxh4", "Rxf7+", "Kh8", "Bg7+", "Kg8", "Rxe7+", "Kh7", "Bf6+", "Kh6", "Bxh4"]
  },
  {
    order: 268,
    fen: "r1b2r2/5P1p/ppn3pk/2p1p1Nq/1bP1PQ2/3P4/PB4BP/1R3RK1 w - - 0 1",
    solution: ["Ne6+", "g5", "Qf6+", "Qg6", "Bc1", "Bxe6", "Bxg5+", "Kh5", "Bf3+", "Bg4", "Bxg4+", "Kxg4", "Rf4+", "exf4", "Qxf4+", "Kh3", "Qg3#"]
  },
  {
    order: 269,
    fen: "1r3kr1/2qn1pp1/3Nb3/6Pp/8/Q4P2/PPP4P/2KRR3 w - - 0 1",
    solution: ["Nc8+", "Qc5", "Qxc5+", "Nxc5", "Rd8#"]
  },
  {
    order: 270,
    fen: "2r1kb1r/1p1R2pp/p3p3/1Q3p2/4N3/8/PPP2PpP/6K1 w k - 0 1",
    solution: ["Rxg7+", "axb5", "Nf6+", "Kd8", "Rd7#"]
  },
  {
    order: 271,
    fen: "1rr4k/5qp1/4R2p/p1p1R3/2P2P2/P1Q3P1/7P/6K1 w - - 0 1",
    solution: ["Rxh6+", "gxh6", "Re7+", "Kg8", "Rxf7", "Kxf7", "Qxa5"]
  },
  {
    order: 272,
    fen: "3r1rk1/2p1qp2/p5p1/1p1P3p/5b1P/P2P4/BP3P2/2RQ1KR1 w - - 0 1",
    solution: ["Rxg6+", "fxg6", "d6+", "Qf7", "Bxf7+"]
  },
  {
    order: 273,
    fen: "3r3k/p5qp/bp2B1p1/3P1p2/2n2N2/2R5/PQ3PPP/6K1 w - - 0 1",
    solution: ["Nxg6+", "Qxg6", "Rxc4+", "Qg7", "Qxg7+", "Kxg7", "Rc7+"]
  },
  {
    order: 274,
    fen: "2r2rk1/pp1qbppp/5n2/3p4/3P4/7Q/PP3PPP/RBB1R1K1 w - - 0 1",
    solution: ["Bxh7+", "Kh8", "Bf5+", "Kg8", "Bxd7"]
  },
  {
    order: 275,
    fen: "8/2n5/8/4k3/8/2N5/1B6/K7 w - - 0 1",
    solution: ["Nb5+", "Ke6", "Nxc7+"]
  },
  {
    order: 276,
    fen: "8/8/8/4q3/8/8/K1k2P1R/8 w - - 0 1",
    solution: ["f4+", "Kd3", "fxe5"]
  },
  {
    order: 277,
    fen: "8/8/3k4/8/4K3/6N1/5bpB/8 w - - 0 1",
    solution: ["Nh1+", "Ke7", "Nxf2"]
  },
  {
    order: 278,
    fen: "k5r1/3P4/2K5/8/1N6/8/6Bb/8 w - - 0 1",
    solution: ["Kb6+", "Rxg2", "d8=Q+", "Bb8", "Qd5#"]
  },
  {
    order: 279,
    fen: "r2qkb1r/ppp2ppp/3p4/8/3nB1b1/3P1N2/PPP1QPPP/R1B1K2R w KQkq - 0 1",
    solution: ["Bc6#"]
  },
  {
    order: 280,
    fen: "r7/qkp5/1np5/5n2/8/1N6/1Q2b1P1/6K1 b - - 0 1",
    solution: ["Nc4+", "Nc5+", "Kc8", "Qh8#"]
  },
  {
    order: 281,
    fen: "rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 1",
    solution: ["Qd8+", "Kxd8", "Bg5+", "Kc7", "Bd8#"]
  },
  {
    order: 282,
    fen: "1r4r1/pbpknp1p/1b3P2/8/8/B1PB1q2/P4PPP/3R2K1 w - - 0 1",
    solution: ["Bf5+", "Ke8", "Bd7+", "Kd8", "Bxe7#"]
  },
  {
    order: 283,
    fen: "r1b1knr1/pp2bp1p/1q6/5p2/4N3/8/PPPQBPPP/2KRR3 w q - 0 1",
    solution: ["Nf6+", "Bxf6", "Qd8+", "Qxd8", "Bb5#"]
  },
  {
    order: 284,
    fen: "5rk1/1bpn1p1p/1p1b1Qp1/p7/3N2r1/1P3Pq1/PBP5/7K w - - 0 1",
    solution: ["Qg7+", "Kxg7", "Nf5+", "Kg8", "Nh6#"]
  },
  {
    order: 285,
    fen: "rn1q1rk1/p2pb1pp/bp2p3/2pnN2Q/3PN3/3B4/PPPB1PPP/R3K2R w KQ - 0 1",
    solution: ["Qxh7+", "Kxh7", "Nf6+", "Kh8", "Ng6#"]
  },
  {
    order: 286,
    fen: "r1b1k1nr/ppp2ppp/3b1q2/2nP4/5p2/5N2/PPPPB1PP/RNBQR1K1 w kq - 0 1",
    solution: ["Bb5+", "Kd8", "Re8#"]
  },
  {
    order: 287,
    fen: "2r2r1k/2q3pB/7p/4N3/8/1PP4P/P1Q3P1/5R1K w - - 0 1",
    solution: ["Ng6+", "Kxh7", "Nxf8+", "Kg8", "Qh7#"]
  },
  {
    order: 288,
    fen: "r1b2rk1/1p4p1/p3p2p/3pR3/1P1Q1q2/3B2R1/P1P2PPP/6K1 w - - 0 1",
    solution: ["Rxg7+", "Kxg7", "Rg5+", "Kf7", "Rg7+", "Ke8", "Bg6+", "Rf7", "Qxf4"]
  },
  {
    order: 289,
    fen: "r5r1/ppk1B1R1/8/8/8/5P2/5KPP/8 w - - 0 1",
    solution: ["Bd8+", "Kxd8", "Rxg8+", "Ke7", "Rxa8"]
  },
  {
    order: 290,
    fen: "5k2/1b3pp1/7p/1N1q2r1/Q7/7P/5PP1/4R2K w - - 0 1",
    solution: ["Re8+", "Kxe8", "Nc7+", "Ke7", "Nxd5+"]
  },
  {
    order: 291,
    fen: "r1b2rk1/2qn1p1p/p1pbp1p1/2ppN3/5P2/1P2P2R/PBPP2PP/RN1Q2K1 w - - 0 1",
    solution: ["Qh5", "gxh5", "Rg3+", "Kh8", "Nxf7#"]
  },
  {
    order: 292,
    fen: "r2qk2r/pp1Npp1p/8/n1pP1p2/Q1P5/8/P2BBPPP/b3K2R w Kkq - 0 1",
    solution: ["Nf6+", "Kf8", "Bh6#"]
  },
  {
    order: 293,
    fen: "1k1r3r/ppR4p/6p1/3p4/4PB2/8/q1P2QPP/6K1 w - - 0 1",
    solution: ["Rc8+", "Kxc8", "Qc5+", "Kd7", "Qd6+", "Ke8", "Qe6+", "Kf8", "Bh6#"]
  },
  {
    order: 294,
    fen: "r1bqk2r/pp3ppp/5n2/8/3nNB2/3P4/PP1b2PP/1K2RBNR w kq - 0 1",
    solution: ["Nxf6+", "Kf8", "Bd6+", "Qe7", "Bxe7#"]
  },
  {
    order: 295,
    fen: "r2n1nk1/pb1P1pp1/1p2pR1p/q7/2PB2QP/3B4/6P1/3R3K w - - 0 1",
    solution: ["Qxg7+", "Kxg7", "Rg6+", "Kh7", "Rg7+", "Kh8", "Rh7+", "Kg8", "Rh8#"]
  },
  {
    order: 296,
    fen: "r1bqk2r/pppp1ppp/8/PB2N3/3n4/B7/2PPQnPP/RN2K2R w KQkq - 0 1",
    solution: ["Nxd7+", "Nxe2", "Nf6#"]
  },
  {
    order: 297,
    fen: "1k1r1bnr/1pR5/p3bp2/6pp/N3p3/PP3NBP/5PP1/3q1RK1 w - - 0 1",
    solution: ["Rc8+", "Ka7", "Bb8+", "Ka8", "Nb6#"]
  },
  {
    order: 298,
    fen: "4rrk1/1p3p1p/p3bRpQ/2p5/P4b2/3BP3/1BPP4/7K w - - 0 1",
    solution: ["Qg7+", "Kxg7", "Rxg6#"]
  },
  {
    order: 299,
    fen: "4rqk1/ppp2rp1/1b2b3/n5p1/4N1P1/3B4/PPP2P1Q/2KR4 w - - 0 1",
    solution: ["Qh7+", "Kxh7", "Nf6+", "Kh6", "Rh1#"]
  },
  {
    order: 300,
    fen: "r3k1nr/pppb2pp/6q1/2Q5/3pPB2/2P5/P5PP/RN3RK1 w kq - 0 1",
    solution: ["Qf8+", "Kxf8", "Bd6+", "Ke8", "Rf8#"]
  },
  {
    order: 301,
    fen: "r3r3/3q1pkp/p3bbp1/1pPp4/1P1Q4/P1N3PP/1BB2P1K/R7 w - - 0 1",
    solution: ["Qxf6+", "Kxf6", "Nxd5+", "Kg5", "Bc1+", "Kh5", "Nf6#"]
  },
  {
    order: 302,
    fen: "4b1k1/4r3/3q1Q2/1pb4p/p2pBN2/3P1RP1/1P5P/6K1 w - - 0 1",
    solution: ["Qf8+", "Kxf8", "Ne6+", "Kg8", "Rf8#"]
  },
  {
    order: 303,
    fen: "r3Rbk1/1p3p1p/2pq2p1/4Q3/2PNn3/1P5P/rB3PP1/5RK1 w - - 0 1",
    solution: ["Qg7+", "Kxg7", "Nf5+", "Kg8", "Nh6#"]
  },
  {
    order: 304,
    fen: "rn2kb1r/pp2pp1p/2p2p2/8/8/3Q4/qPPB1PPP/2KR3R w kq - 0 1",
    solution: ["Qd8+", "Kxd8", "Ba5+", "Kc8", "Rd8#"]
  },
  {
    order: 305,
    fen: "8/1k3p2/8/3r4/8/5B2/2P1K3/8 b - - 0 1",
    solution: ["Kc6", "c4"]
  },
  {
    order: 306,
    fen: "2R3nk/6q1/8/8/8/2B5/3Q3K/8 w - - 0 1",
    solution: ["Qh6#"]
  },
  {
    order: 307,
    fen: "6k1/5b2/8/6n1/6R1/8/2P5/3K4 b - - 0 1",
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
    fen: "8/p1r3n1/R1p2k2/4p3/8/1P2NPP1/P6P/6K1 w - - 0 1",
    solution: ["Nd5+", "Kg6", "Nxc7"]
  },
  {
    order: 311,
    fen: "2bq1rk1/5pbp/1npp2p1/2n5/2P1P3/1PN1B1PP/2Q2PB1/3R2K1 w - - 0 1",
    solution: ["Bxc5"]
  },
  {
    order: 312,
    fen: "2k5/2nq1pp1/p1Q1p3/P3PbPp/3P4/2R2P2/1P4PK/8 w - - 0 1",
    solution: ["Qa8#"]
  },
  {
    order: 313,
    fen: "8/8/p4p2/k1K5/p7/R7/1P4p1/5q2 w - - 0 1",
    solution: ["b4#"]
  },
  {
    order: 314,
    fen: "6k1/4qrp1/3p3Q/p1pB1p2/1pP4P/1P5P/P7/B1n4K w - - 0 1",
    solution: ["Qxg7#"]
  },
  {
    order: 315,
    fen: "4rkr1/1p1Rn1pp/p1p1p2B/5p2/3Q4/8/PPq1PPPP/3R2K1 w - - 0 1",
    solution: ["Qf6#"]
  },
  {
    order: 316,
    fen: "r2k4/1pp2rpp/pn3p2/3n4/8/P4NB1/1PP3PP/2KRR3 w - - 0 1",
    solution: ["c4", "Nxc4", "Rxd5+"]
  },
  {
    order: 317,
    fen: "6k1/q1pp2bp/8/8/8/8/PQ3P2/KR6 w - - 0 1",
    solution: ["Rg1", "Kf7", "Qxg7+"]
  },
  {
    order: 318,
    fen: "8/5rkp/5bp1/8/6PP/2B2R2/6K1/8 w - - 0 1",
    solution: ["Rxf6", "Rxf6", "g5"]
  },
  {
    order: 319,
    fen: "7r/1bk2q2/2p2p2/p1Q1pP1p/4P2P/2N3r1/PPPR4/2K5 w - - 0 1",
    solution: ["Nb5+", "Kb8", "Qa7+", "Kc8", "Nd6+", "Kd8", "Nxf7+"]
  },
  {
    order: 320,
    fen: "8/1n3k2/pb2p1p1/2p1Pp1p/1pP2P1P/1P1N2P1/P1K2B2/8 w - - 0 1",
    solution: ["Nxb4", "cxb4", "Bxb6"]
  },
  {
    order: 321,
    fen: "rn6/kp3p2/pq4p1/N1Q4p/8/P6P/5PP1/3R2K1 w - - 0 1",
    solution: ["Rb1", "Qxc5", "Rxb7#"]
  },
  {
    order: 322,
    fen: "3r2rk/p4p1p/3p1Pp1/3R4/2p1B2Q/8/1q4PP/4R1K1 w - - 0 1",
    solution: ["Qxh7+", "Kxh7", "Rh5#"]
  },
  {
    order: 323,
    fen: "3r2k1/1p5p/6p1/p2q1p2/P1Q5/1P5P/1P6/5RK1 w - - 0 1",
    solution: ["Rd1", "Qxc4", "Rxd8+", "Kg7", "bxc4"]
  },
  {
    order: 324,
    fen: "8/kp2q3/pR2r2r/1P1p4/P2P4/4Q2R/4K3/8 w - - 0 1",
    solution: ["Rxe6", "Rxe6", "b6+", "Kxb6", "Rh6", "Rxh6", "Qxe7"]
  },
  {
    order: 325,
    fen: "5r1k/4R3/p1pp4/3p1bQ1/3q1P2/7P/P2B2P1/7K w - - 0 1",
    solution: ["Qh4+", "Kg8", "Qg3+", "Kh8", "Bc3"]
  },
  {
    order: 326,
    fen: "r4k2/pp3ppp/1q2p1b1/2r1P3/Q7/8/PP2BPPP/2R2RK1 w - - 0 1",
    solution: ["Qa3", "Rac8", "Rxc5", "Qxc5", "Rc1", "Qxa3", "Rxc8+", "Ke7", "bxa3"]
  },
  {
    order: 327,
    fen: "2r5/1p1bkp2/p2q1p2/3Pp3/7Q/1B6/P1P3PP/1K3R2 w - - 0 1",
    solution: ["Rxf6", "Qxf6", "d6+", "Kxd6", "Qxf6+"]
  },
  {
    order: 328,
    fen: "8/2p1P3/2p5/p2b3p/6B1/1k2rR2/1P4K1/8 w - - 0 1",
    solution: ["Be6", "Rxf3", "Bxd5+", "cxd5", "Kxf3"]
  },
  {
    order: 329,
    fen: "3r3k/p1p1qp2/1pQ1pPpp/8/8/8/PPP2PPP/3R2K1 w - - 0 1",
    solution: ["Qa8", "Qxf6", "Qxd8+", "Qxd8", "Rxd8+"]
  },
  {
    order: 330,
    fen: "4Rrk1/3P2pp/p2q4/1p6/3p4/P7/1PP3P1/1K1R4 w - - 0 1",
    solution: ["Rf1", "Qxd7", "Rfxf8#"]
  },
  {
    order: 331,
    fen: "3r1r1k/pp5p/2p3pQ/1q2n3/4P3/2B5/PPP5/2KRR3 w - - 0 1",
    solution: ["Rd5", "Qxd5", "exd5"]
  },
  {
    order: 332,
    fen: "6k1/r6p/pp1p2p1/2pP2q1/P1Pb4/4B3/1P1Q2PP/5RK1 w - - 0 1",
    solution: ["Qxd4", "cxd4", "Bxg5"]
  },
  {
    order: 333,
    fen: "r2qkbnr/pp2pppp/8/3p4/3n2b1/5N2/PPPN1PPP/R1BQKB1R w KQkq - 0 1",
    solution: ["Nxd4", "Bxd1", "Bb5+", "Qd7", "Bxd7+", "Kxd7", "Kxd1"]
  },
  {
    order: 334,
    fen: "k1K5/b7/8/1P6/4R3/3n4/8/8 w - - 0 1",
    solution: ["Ra4", "Nc5", "b6", "Nxa4", "b7#"]
  },
  {
    order: 335,
    fen: "r3kb1r/2pn1p1p/p3p1p1/1P1q2NQ/2pP4/2P3P1/5P1P/R1B1R1K1 w kq - 0 1",
    solution: ["Nxe6", "Qxe6", "Rxe6+"]
  },
  {
    order: 336,
    fen: "8/p1r5/R1p3k1/8/1P2p3/8/1P3PP1/6K1 w - - 0 1",
    solution: ["b5", "Kf7", "bxc6"]
  },
  {
    order: 337,
    fen: "3b1q1k/6rp/2p4Q/p2pP3/3P1N2/1P4B1/P5K1/8 w - - 0 1",
    solution: ["Ng6+", "Rxg6", "Qxf8+", "Rg8", "Qd6"]
  },
  {
    order: 338,
    fen: "2r3k1/3b2pp/1pp1r3/p2p1p2/Pq3P2/1PRQP1P1/6BP/2R3K1 w - - 0 1",
    solution: ["Bxd5", "cxd5", "Rxc8+", "Bxc8", "Rxc8+"]
  },
  {
    order: 339,
    fen: "6k1/6pp/2q2p2/2brp3/P3Q3/4B1P1/5P1P/4R1K1 w - - 0 1",
    solution: ["Qc4", "Qd6", "Rd1", "Bd4", "Bxd4", "Kf8"]
  },
  {
    order: 340,
    fen: "8/8/2kB4/3n4/4K3/5B2/8/8 w - - 0 1",
    solution: ["Ke5", "Kb5", "Bxd5"]
  },
  {
    order: 341,
    fen: "r1bk1r2/1ppp3p/p3n3/2qNP3/8/5Q2/PPP1B2P/2K2RR1 w - - 0 1",
    solution: ["Rg8", "Rxg8", "Qf6+", "Ke8", "Qf7+", "Kd8", "Qxg8+", "Nf8", "Rxf8+", "Qxf8", "Qxf8#"]
  },
  {
    order: 342,
    fen: "8/p1Rb2k1/1p1r1ppp/3P4/4rN2/8/P5P1/2R3K1 w - - 0 1",
    solution: ["R1c6", "Rxc6", "dxc6", "Rxf4", "Rxd7+", "Kf8", "c7", "Rc4", "Rd8+", "Ke7", "c8=Q", "Rxc8", "Rxc8"]
  },
  {
    order: 343,
    fen: "8/5q2/k4r1R/8/2p1Q3/8/2K5/8 w - - 0 1",
    solution: ["Qf5", "Rxh6", "Qxf7"]
  },
  {
    order: 344,
    fen: "5nk1/3q2pp/1p2n3/p1bQP3/Pp1p4/3N4/1B4PP/5R1K w - - 0 1",
    solution: ["Rxf8+", "Kxf8", "Qxd7"]
  },
  {
    order: 345,
    fen: "r1b1qrk1/pp1p1pp1/5P1p/n3p2Q/2B5/8/8/6K1 w - - 0 1",
    solution: ["Qg6", "Nxc4", "Qxg7#"]
  },
  {
    order: 346,
    fen: "2q5/8/8/5k2/8/8/3K4/5B2 w - - 0 1",
    solution: ["Bh3+", "Ke4", "Bxc8"]
  },
  {
    order: 347,
    fen: "8/1r6/1P6/3k3r/8/K1p5/4PPB1/2B5 b - - 0 1",
    solution: ["Kc4", "Bxb7", "Ra5#"]
  },
  {
    order: 348,
    fen: "7R/r4k2/8/8/8/8/6K1/8 w - - 0 1",
    solution: ["Rh7+", "Kf6", "Rxa7"]
  },
  {
    order: 349,
    fen: "8/P7/1K6/8/8/5k2/8/7q w - - 0 1",
    solution: ["a8=Q+", "Ke3", "Qxh1"]
  },
  {
    order: 350,
    fen: "2r5/1R2bPk1/5pp1/8/p1B5/8/5r2/2K4R w - - 0 1",
    solution: ["f8=Q+", "Kxf8", "Rh8+", "Kg7", "Rxc8"]
  },
  {
    order: 351,
    fen: "1R4B1/3r2k1/5p1b/7p/1P6/3n4/1r3P1P/R3N1K1 w - - 0 1",
    solution: ["Nxd3", "Rxd3", "Ra7+", "Kg6", "Bh7+", "Kg5", "Bxd3"]
  },
  {
    order: 352,
    fen: "q3N3/8/7p/7K/4kp2/1pQ5/8/8 w - - 0 1",
    solution: ["Nd6+", "Kd5", "Qf3+", "Kxd6", "Qxa8"]
  },
  {
    order: 353,
    fen: "rn3b1r/pQpk2p1/2qnppB1/8/6PP/2N1B3/PPP2P2/2KR3R w - - 0 1",
    solution: ["Be4", "Qxb7", "Bxb7", "Nc6", "Bxa8"]
  },
  {
    order: 354,
    fen: "3Q4/5knp/1nN3p1/2p5/5P2/1q6/1P4PP/6K1 w - - 0 1",
    solution: ["Ne5+", "Ke6", "Qg8+", "Kf5", "Qxb3"]
  },
  {
    order: 355,
    fen: "1q4k1/4pR2/pn2r1p1/6P1/8/P1P2Q2/KP5P/8 w - - 0 1",
    solution: ["Qh3", "Kxf7", "Qh7+", "Kf8", "Qh8+", "Kf7", "Qxb8"]
  },
  {
    order: 356,
    fen: "1b6/5k2/6p1/3K4/5p2/5P1R/8/8 w - - 0 1",
    solution: ["Rh8", "Bc7", "Rh7+", "Kf6", "Rxc7"]
  },
  {
    order: 357,
    fen: "5kb1/8/8/4K3/8/8/8/2R5 w - - 0 1",
    solution: ["Kf6", "Ke8", "Rc8+", "Kd7", "Rxg8"]
  },
  {
    order: 358,
    fen: "3r2k1/2q3pp/2p2p2/8/2Pp1P1n/1P6/P2B2PP/2Q2R1K w - - 0 1",
    solution: ["Qe1", "Ng6", "Ba5", "Qd7", "Bxd8"]
  },
  {
    order: 359,
    fen: "7K/6P1/4k3/8/7Q/p1q5/8/8 w - - 0 1",
    solution: ["Qc4+", "Qxc4", "g8=Q+", "Kd6", "Qxc4"]
  },
  {
    order: 360,
    fen: "7k/B7/6pp/4br2/3pR3/3P4/6PP/6K1 w - - 0 1",
    solution: ["Rxe5", "Rxe5", "Bxd4", "Kh7", "Bxe5"]
  },
  {
    order: 361,
    fen: "r4k2/6p1/7p/2p1p3/3rb1B1/1P5P/6PK/2R1R3 w - - 0 1",
    solution: ["Rxe4", "Rxe4", "Bf3", "Rd4", "Bxa8"]
  },
  {
    order: 362,
    fen: "7K/6P1/8/6k1/3q4/8/8/5Q2 w - - 0 1",
    solution: ["Qg1+", "Qxg1", "g8=Q+", "Kf4", "Qxg1"]
  },
  {
    order: 363,
    fen: "1bb2rk1/r4ppp/p2q1n2/1p6/3pP2B/1N1P1P2/1P1N2PP/2RQ1R1K w - - 0 1",
    solution: ["e5", "Qxe5", "Bg3", "Qe7", "Bxb8"]
  },
  {
    order: 364,
    fen: "1kr5/R1p5/1P6/8/8/8/8/2K5 w - - 0 1",
    solution: ["b7", "Rh8", "Ra8+", "Kxb7", "Rxh8"]
  },
  {
    order: 365,
    fen: "7Q/8/3k4/2Np4/4p1K1/8/3q4/8 w - - 0 1",
    solution: ["Nxe4+", "dxe4", "Qd8+", "Ke5", "Qxd2"]
  },
  {
    order: 366,
    fen: "2Q5/1p4q1/p4k2/6p1/P3b3/6BP/5PP1/6K1 w - - 0 1",
    solution: ["Be5+", "Kxe5", "Qc3+", "Kf4", "Qxg7"]
  },
  {
    order: 367,
    fen: "8/8/1p2p2P/1k2K3/8/pPP5/8/8 w - - 0 1",
    solution: ["h7", "a2", "h8=Q", "a1=Q", "Qe8+", "Kc5", "Qc8+", "Kb5", "Qc4+", "Ka5", "b4+", "Ka4", "Qa6+", "Kb3", "Qxa1"]
  },
  {
    order: 368,
    fen: "8/1q1k4/1Pp3p1/3pPp1p/5P2/6P1/1Q5K/8 w - - 0 1",
    solution: ["e6+", "Kxe6", "Qe5+", "Kf7", "Qc7+", "Qxc7", "bxc7", "Ke6", "c8=Q+"]
  },
  {
    order: 369,
    fen: "5r1k/6pp/3p4/3Pn3/8/6NP/5qP1/1Q1R3K w - - 0 1",
    solution: ["Rf1", "Qxf1+", "Nxf1"]
  },
  {
    order: 370,
    fen: "4k2r/5p2/2p5/4q2p/8/4B1PP/2P2Q2/6K1 w k - 0 1",
    solution: ["Bd4", "Qd5", "Bxh8"]
  },
  {
    order: 371,
    fen: "1rb3k1/p1q2p1p/1p4p1/8/8/2P1BB2/1P1Q2P1/2K5 w - - 0 1",
    solution: ["Bf4", "Qe7", "Bxb8"]
  },
  {
    order: 372,
    fen: "3qrr1k/6p1/3p2P1/3N1p2/4pQ2/7P/8/2R4K w - - 0 1",
    solution: ["Rc8", "Qxc8", "Qh4+", "Kg8", "Qh7#"]
  },
  {
    order: 373,
    fen: "1r1q2rk/7p/7Q/8/2b2P2/6RP/6PK/4R3 w - - 0 1",
    solution: ["Re8", "Qxe8", "Qf6+", "Rg7", "Qxg7#"]
  },
  {
    order: 374,
    fen: "4kb1r/p4ppp/qp2p3/3rN1B1/3Q4/1P6/1P3PPP/2R3K1 w k - 0 1",
    solution: ["Qa4+", "Qb5", "Rc8+", "Rd8", "Rxd8#"]
  },
  {
    order: 375,
    fen: "1k6/1Pr5/K1nR1p2/4p3/4P3/4BP2/8/8 w - - 0 1",
    solution: ["Rd8+", "Nxd8", "Ba7#"]
  },
  {
    order: 376,
    fen: "2B5/8/5K2/4Q3/8/5k2/8/1r5q w - - 0 1",
    solution: ["Bb7+", "Rxb7", "Qd5+", "Ke3", "Qxh1"]
  },
  {
    order: 377,
    fen: "6b1/1p3q1k/7p/6pP/4p1B1/P1BnP1Q1/1P4P1/6K1 w - - 0 1",
    solution: ["Qc7", "Qxc7", "Bf5#"]
  },
  {
    order: 378,
    fen: "5r1k/1p4pp/8/1P5Q/r2Bq3/6P1/n4P1P/2R3K1 w - - 0 1",
    solution: ["Qf7", "Rg8", "Rc8", "Rxc8", "Qxg7#"]
  },
  {
    order: 379,
    fen: "r3bk2/1p2b3/2n2q2/p2B2p1/2Pp4/PP3QP1/5P1P/2B1R1K1 w - - 0 1",
    solution: ["Bxg5", "Qxf3", "Bh6#"]
  },
  {
    order: 380,
    fen: "4k3/3pPpK1/3P1Pb1/8/8/8/B7/8 w - - 0 1",
    solution: ["Be6", "dxe6", "d7+", "Kxd7", "Kf8", "e5", "e8=Q+"]
  },
  {
    order: 381,
    fen: "r4r2/pp3p1N/4q3/2p1n1p1/4P1k1/3p2P1/PPP3KR/5R2 w - - 0 1",
    solution: ["Rf4+", "gxf4", "Rh4#"]
  },
  {
    order: 382,
    fen: "5rk1/pp1q2p1/2p3Qp/2Pb1p2/r3n3/P3P3/1B2BPPP/3R1RK1 w - - 0 1",
    solution: ["Rxd5", "cxd5", "Bb5", "Qf7", "Qxf7+", "Rxf7", "Bxa4"]
  },
  {
    order: 383,
    fen: "r4r1k/p2p3p/3N2RP/3q4/6Q1/8/P1P2PPK/8 w - - 0 1",
    solution: ["Rg8+", "Rxg8", "Qd4+", "Qxd4", "Nf7#"]
  },
  {
    order: 384,
    fen: "2Q5/1R6/5q1k/3rnpp1/1P2p3/6P1/4BPK1/8 w - - 0 1",
    solution: ["Rb6", "Qxb6", "Qh8+", "Kg6", "Bh5#"]
  },
  {
    order: 385,
    fen: "k1n5/p2R2bb/2p2qpp/4rp2/2P5/4Q1P1/PP3PBP/6K1 w - - 0 1",
    solution: ["Qxe5", "Qxe5", "Bxc6+", "Kb8", "Rb7+", "Ka8", "Rb6#"]
  },
  {
    order: 386,
    fen: "5r1k/ppq2ppp/2p4N/4b3/8/6Q1/PPP2PPP/3R2K1 w - - 0 1",
    solution: ["Qxe5", "Qxe5", "Nxf7+", "Kg8", "Nxe5"]
  },
  {
    order: 387,
    fen: "2rr4/pq2k1Bp/1p2nN2/2b2p1Q/8/1P6/3R1PPP/3R2K1 w - - 0 1",
    solution: ["Qe8+", "Rxe8", "Rd7+", "Qxd7", "Rxd7#"]
  },
  {
    order: 388,
    fen: "2Q5/1p3p1k/p2prPq1/8/7p/8/PP3RP1/6K1 w - - 0 1",
    solution: ["Qxe6", "fxe6", "f7", "Qxf7", "Rxf7+"]
  },
  {
    order: 389,
    fen: "8/R7/1P6/1k6/8/2K5/8/1r6 w - - 0 1",
    solution: ["Ra1", "Rxa1", "b7", "Kc5", "b8=Q"]
  },
  {
    order: 390,
    fen: "8/p4pbp/1p4p1/2p1Pk2/5P2/P1B2K2/1P3P1P/8 w - - 0 1",
    solution: ["e6", "fxe6", "Bxg7"]
  },
  {
    order: 391,
    fen: "6rk/6b1/6Qp/8/5P2/p5P1/q5PK/6B1 w - - 0 1",
    solution: ["Bd4", "Bxd4", "Qxh6#"]
  },
  {
    order: 392,
    fen: "5R2/1p5k/2r4b/4p2P/p2pN1p1/P2P2P1/4q3/5R1K w - - 0 1",
    solution: ["Ng5+", "Bxg5", "R1f7+", "Kh6", "Rh8#"]
  },
  {
    order: 393,
    fen: "7k/pp2n3/4PP1r/2p3R1/3p4/P7/1PP4P/7K w - - 0 1",
    solution: ["Rh5", "Rxh5", "fxe7", "Re5", "e8=Q+"]
  },
  {
    order: 394,
    fen: "r3k2r/pp1n1ppp/2p1p3/5b2/PbNPq3/2N5/1P1K2PP/R1BQ1B1R w kq - 0 1",
    solution: ["Nd6+", "Bxd6", "Nxe4"]
  },
  {
    order: 395,
    fen: "8/5pp1/7k/1p2RQ1P/3q1p2/P7/3r1PP1/6K1 w - - 0 1",
    solution: ["Re6+", "Qf6", "Rxf6+"]
  },
  {
    order: 396,
    fen: "4kb1r/2Rn1b2/q4p1p/4pNp1/3pPP2/3P2PP/1P4B1/3QN1K1 w k - 0 1",
    solution: ["Qa4", "Qxa4", "Rc8#"]
  },
  {
    order: 397,
    fen: "r1b3k1/ppq2ppp/2n5/8/1Q2N3/4B3/PPP3PP/2K1R3 w - - 0 1",
    solution: ["Nf6+", "gxf6", "Qf8+", "Kxf8", "Bh6+", "Kg8", "Re8#"]
  },
  {
    order: 398,
    fen: "4q1k1/8/5P2/5N2/8/7P/6P1/6K1 w - - 0 1",
    solution: ["f7+", "Kxf7", "Nd6+", "Kf8", "Nxe8"]
  },
  {
    order: 399,
    fen: "8/k7/1q6/8/8/N1B5/1P6/1K6 w - - 0 1",
    solution: ["Bd4", "Qxd4", "Nb5+", "Kb7", "Nxd4"]
  },
  {
    order: 400,
    fen: "r7/3q1k1p/p4p2/1p2p1p1/8/1P6/P5PP/1QR4K w - - 0 1",
    solution: ["Rc7", "Qxc7", "Qxh7+", "Ke6", "Qxc7"]
  },
  {
    order: 401,
    fen: "2q3k1/6p1/r3pn2/3p4/3b1NP1/1p1Q4/1P1B1P2/1K5R w - - 0 1",
    solution: ["Rh8+", "Kxh8", "Ng6+", "Kg8", "Ne7+", "Kf7", "Nxc8"]
  },
  {
    order: 402,
    fen: "6k1/1p3p2/p6p/5Np1/5q2/Q6P/PPr5/3R3K w - - 0 1",
    solution: ["Qf8+", "Kxf8", "Rd8#"]
  },
  {
    order: 403,
    fen: "8/p2q1r1k/2b2B1p/5P2/8/P7/R2Q4/6K1 w - - 0 1",
    solution: ["Qxh6+", "Kg8", "Qh8#"]
  },
  {
    order: 404,
    fen: "6r1/2q5/1p1k2p1/2pp3p/8/1P4PP/PB4P1/2Q3K1 w - - 0 1",
    solution: ["Be5+", "Kxe5", "Qf4+", "Ke6", "Qxc7"]
  },
  {
    order: 405,
    fen: "r1b2rk1/pp4p1/2p4n/2Qp1pq1/3P1N1n/3BP1N1/PP3PP1/1K1R3R w - - 0 1",
    solution: ["Rxh4", "Qxh4", "Qxf8+", "Kxf8", "Ng6+", "Kg8", "Nxh4"]
  },
  {
    order: 406,
    fen: "3r2k1/pR3p2/2n3pQ/2Bp4/P2P3K/5R1P/4r1q1/8 w - - 0 1",
    solution: ["Qg7+", "Kxg7", "Rfxf7+", "Kg8", "Rg7+", "Kh8", "Rh7+", "Kg8", "Rbg7#"]
  },
  {
    order: 407,
    fen: "r1b1kb1r/ppp2ppp/2n2n2/6B1/Q3q3/8/PPP2PPP/2KR1BNR w kq - 0 1",
    solution: ["Rd8+", "Kxd8", "Qxe4"]
  },
  {
    order: 408,
    fen: "8/qp4kp/2p3p1/3n4/1B5P/5PPK/r7/2Q1R3 w - - 0 1",
    solution: ["Qh6+", "Kxh6", "Bf8+", "Kh5", "g4#"]
  },
  {
    order: 409,
    fen: "2r4k/7p/1Qq2pnP/p4p2/r2pP3/6R1/5PP1/3R2K1 w - - 0 1",
    solution: ["Rc3", "dxc3", "Rd8+", "Rxd8", "Qxd8+", "Qe8", "Qxf6+", "Kg8", "Qg7#"]
  },
  {
    order: 410,
    fen: "r6r/2qkb3/1n2p1Q1/3pP1Pp/1p1P4/1p2B3/1P3RBP/5NK1 w - - 0 1",
    solution: ["Qxe6+", "Ke8"]
  },
  {
    order: 411,
    fen: "r1b1k2r/b1qpn2p/p5p1/4p3/1p1N1B2/1BPQ4/PP4PP/2KR1R2 w kq - 0 1",
    solution: ["Bf7+", "Kxf7", "Bxe5+", "Kg8", "Bxc7"]
  },
  {
    order: 412,
    fen: "2r1r1k1/1b3pp1/1n4p1/p1p1p3/1pB1P3/1P3NP1/P4PK1/R6R w - - 0 1",
    solution: ["Rh8+", "Kxh8", "Bxf7", "Rf8", "Rh1#"]
  },
  {
    order: 413,
    fen: "r2r4/1p1R3p/5p1k/b1B1Pp2/p4P2/P7/1P5P/1K4R1 w - - 0 1",
    solution: ["Bf8+", "Rxf8", "Rd3", "Rg8", "Rh3#"]
  },
  {
    order: 414,
    fen: "1brqr1k1/pp3pp1/4n2p/3Np3/QP2P3/P6P/3N1PP1/2R2RK1 w - - 0 1",
    solution: ["Qxe8+", "Qxe8", "Rxc8", "Qxc8", "Ne7+", "Kh7", "Nxc8"]
  },
  {
    order: 415,
    fen: "2r1q1k1/p4ppp/2n5/1p1N4/6Q1/1P4P1/Pb4BP/2R4K w - - 0 1",
    solution: ["Qxc8", "Qxc8", "Rxc6", "Qxc6", "Ne7+", "Kf8", "Nxc6"]
  },
  {
    order: 416,
    fen: "8/2Q4p/3nkp2/1p6/3Pq3/8/4N1PP/6K1 w - - 0 1",
    solution: ["d5+", "Ke5", "Qe7+", "Kxd5", "Nc3+", "Kd4", "Nxe4"]
  },
  {
    order: 417,
    fen: "r3rnk1/ppq2ppp/5n2/2bp1N2/8/2N2Q2/PPP2PPP/R1B2RK1 w - - 0 1",
    solution: ["Nxg7", "Kxg7", "Qxf6+", "Kxf6", "Nxd5+", "Kg6", "Nxc7", "Rad8", "Nxe8"]
  },
  {
    order: 418,
    fen: "1n6/2qb1kp1/1p2pp1p/1P1p4/1Q1P1N2/4P1PB/5P1P/6K1 w - - 0 1",
    solution: ["Bxe6+", "Bxe6", "Qf8+", "Kxf8", "Nxe6+", "Ke7", "Nxc7"]
  },
  {
    order: 419,
    fen: "r4r2/6kp/2pqppp1/pbR5/3P4/4QN2/PP3PPP/2R3K1 w - - 0 1",
    solution: ["a4", "Bxa4", "Qa3", "Bb5", "Rxb5", "Qxa3", "Rb7+", "Rf7", "Rxf7+", "Kxf7", "bxa3"]
  },
  {
    order: 420,
    fen: "r1bqr1k1/pppnbppp/2np4/8/2BNP3/2N4P/PPP2PP1/R1BQR1K1 w - - 0 1",
    solution: ["Bxf7+", "Kxf7", "Ne6", "Kg8", "Nxd8"]
  },
  {
    order: 421,
    fen: "rn3rk1/pbppq1pp/1p2pb2/4N2Q/3PN3/3B4/PPP2PPP/R3K2R w KQ - 0 1",
    solution: ["Qxh7+", "Kxh7", "Nxf6+", "Kh8", "Ng6#"]
  },
  {
    order: 422,
    fen: "4rnk1/2qn2p1/p3b2p/1pp1N3/2P5/4P1Q1/PB4PP/1B3RK1 w - - 0 1",
    solution: ["Qxg7+", "Kxg7", "Nxd7+", "Kg8", "Nf6+", "Kf7", "Nd5+", "Kg8", "Nxc7"]
  },
  {
    order: 423,
    fen: "r1b1k2r/pp1n3p/2p4q/3pN1p1/3PpP2/2N1P3/PP4PP/R2Q1RK1 w kq - 0 1",
    solution: ["Nf7", "Kxf7", "fxg5+", "Kg7", "gxh6+"]
  },
  {
    order: 424,
    fen: "6k1/1p3p2/p2prPq1/8/7p/2Q5/PP4P1/5RK1 w - - 0 1",
    solution: ["Qc8+", "Kh7", "Qxe6", "fxe6", "f7", "h3", "f8=N+", "Kg7", "Nxg6"]
  },
  {
    order: 425,
    fen: "8/4p3/5p2/3P4/1P3k2/8/8/7K w - - 0 1",
    solution: ["d6", "exd6", "b5", "Ke5", "b6", "d5", "b7", "Kd6", "b8=Q+"]
  },
  {
    order: 426,
    fen: "6k1/5pp1/8/B2n4/5P2/P5Pp/4KQ2/7q w - - 0 1",
    solution: ["Qf3", "Qxf3+", "Kxf3", "Ne3", "Kxe3", "h2", "Kf2", "h1=Q"]
  },
  {
    order: 427,
    fen: "6R1/2pk4/P2p4/1P3p2/8/8/r4PK1/8 w - - 0 1",
    solution: ["b6", "cxb6", "a7", "Rxa7", "Rg7+", "Kc6", "Rxa7"]
  },
  {
    order: 428,
    fen: "6k1/3qrp2/6p1/1P6/1Q6/5P2/3p2PP/3R2K1 b - - 0 1",
    solution: ["Re1+", "Rxe1", "Qd4+", "Qxd4", "dxe1=Q#"]
  },
  {
    order: 429,
    fen: "5k2/NP3pp1/3p4/7p/P2Pp1bP/1r2P1P1/3K1P2/8 w - - 0 1",
    solution: ["Nb5", "Rxb5", "axb5", "Ke7", "b8=Q"]
  },
  {
    order: 430,
    fen: "8/1P6/k7/p7/K7/8/8/8 w - - 0 1",
    solution: ["b8=R"]
  },
  {
    order: 431,
    fen: "B2k4/P6r/3P4/8/2p5/8/8/2K5 w - - 0 1",
    solution: ["Bb7", "Rxb7", "a8=Q+", "Kd7", "Qxb7+"]
  },
  {
    order: 432,
    fen: "8/k7/1b3P2/8/8/8/1B4K1/8 w - - 0 1",
    solution: ["f7", "Bc5", "Bd4", "Bxd4", "f8=Q"]
  },
  {
    order: 433,
    fen: "1N6/2k5/P7/8/8/8/8/1K6 w - - 0 1",
    solution: ["Nd7", "Kc8", "Nc5", "Kc7", "Kb2", "Kb6", "Kb3", "Ka7", "Kb4", "Kb6", "Ka4", "Ka7", "Kb5", "Ka8", "Kb6", "Kb8", "Ne6", "Ka8", "Nc7+", "Kb8", "a7+", "Kc8", "a8=Q+"]
  },
  {
    order: 434,
    fen: "1k3r2/pp3rpp/1P6/P7/8/8/2R2PPP/2R3K1 w - - 0 1",
    solution: ["Rc8+", "Rxc8", "Rxc8+", "Kxc8", "bxa7", "Kc7", "a8=Q"]
  },
  {
    order: 435,
    fen: "8/p7/Pp4R1/8/1n4K1/8/8/1k6 w - - 0 1",
    solution: ["Rxb6", "axb6", "a7", "Nc6", "a8=Q"]
  },
  {
    order: 436,
    fen: "8/5k2/7P/8/8/5K2/2B5/8 w - - 0 1",
    solution: ["Bh7", "Kf8", "Kg4", "Kf7", "Kg5", "Kf8", "Kg6", "Ke7", "Bg8", "Kf8", "h7", "Ke7", "h8=Q"]
  },
  {
    order: 437,
    fen: "1k3K2/pPr5/P7/8/5B2/6p1/8/8 w - - 0 1",
    solution: ["Ke8", "g2", "Kd8", "g1=Q", "Bxc7#"]
  },
  {
    order: 438,
    fen: "4k3/p3r3/1pP1R1p1/7p/8/6P1/P4P1P/6K1 w - - 0 1",
    solution: ["c7", "Kd7", "Rxe7+", "Kc8"]
  },
  {
    order: 439,
    fen: "3Q4/p3b1k1/2p2rPp/2q5/4B3/P2P4/7P/6RK w - - 0 1",
    solution: ["Qh8+", "Kxh8", "g7+", "Kg8", "Bh7+", "Kxh7", "g8=Q#"]
  },
  {
    order: 440,
    fen: "4k3/4pp2/pPp3p1/P2RP2p/r4P2/5K1P/6P1/8 w - - 0 1",
    solution: ["Rb5", "axb5", "b7", "Rxa5", "b8=Q+"]
  },
  {
    order: 441,
    fen: "1k6/ppp3pp/4P1n1/8/8/1P4bP/P5P1/5R1K w - - 0 1",
    solution: ["Rf8+", "Nxf8", "e7", "Ng6", "e8=Q#"]
  },
  {
    order: 442,
    fen: "5nk1/pp4pp/1n3p2/P7/2q5/1QN3BP/1P2PPP1/7K w - - 0 1",
    solution: ["axb6", "Qxb3", "bxa7", "Qxb2", "a8=Q", "Qxc3", "Bd6", "Kf7", "Qxf8+"]
  },
  {
    order: 443,
    fen: "2r1k3/ppP1r1pp/3R4/5R2/8/6P1/P4PP1/6K1 w - - 0 1",
    solution: ["Rd8+", "Rxd8", "Rf8+", "Kxf8", "cxd8=Q+"]
  },
  {
    order: 444,
    fen: "8/6P1/8/8/5N2/7p/7p/4K2k w - - 0 1",
    solution: ["g8=B", "Kg1", "Ne2+", "Kg2", "Bd5#"]
  },
  {
    order: 445,
    fen: "8/2k3p1/1pp2p2/4pn1P/5r1P/1PP5/2P5/2K3RR w - - 0 1",
    solution: ["Rxg7+", "Nxg7", "h6", "Rg4", "h7", "Nf5", "h8=Q"]
  },
  {
    order: 446,
    fen: "8/8/p4kpP/5p2/b2N4/8/5PP1/6K1 w - - 0 1",
    solution: ["Ne6", "Kxe6", "h7", "Kf7", "h8=Q"]
  },
  {
    order: 447,
    fen: "6k1/5p2/2p1P1n1/3P4/8/8/8/1K6 w - - 0 1",
    solution: ["e7", "Nxe7", "d6", "Nc8", "d7", "Nd6", "d8=Q+"]
  },
  {
    order: 448,
    fen: "5rk1/ppp3p1/4p1P1/P5N1/3P4/6K1/1Pr5/7R w - - 0 1",
    solution: ["Nf7", "Rxf7", "Rh8+", "Kxh8", "gxf7", "Rxb2", "f8=Q+"]
  },
  {
    order: 449,
    fen: "8/1p6/6k1/2R5/p7/8/PPP2pP1/7K w - - 0 1",
    solution: ["Rf5", "Kxf5", "g4+", "Kxg4", "Kg2", "f1=Q+", "Kxf1"]
  },
  {
    order: 450,
    fen: "8/8/5p1p/5P1P/4k1P1/2p5/4K3/8 w - - 0 1",
    solution: ["g5", "Kxf5", "gxh6", "Kg5", "h7", "Kxh5", "h8=Q+"]
  },
  {
    order: 451,
    fen: "3qk1r1/pb1pppQp/1p3n2/2r1P3/2P5/1P3P2/P2BB2P/N3K2R w K - 0 1",
    solution: ["exf6", "Rxg7", "fxg7", "e6", "g8=Q+"]
  },
  {
    order: 452,
    fen: "r1b1k2r/pp2qpp1/1P4np/2p1p3/1nB1P3/Q2PBN2/1P3PPP/R3K2R w KQkq - 0 1",
    solution: ["Qxa7", "Rxa7", "bxa7", "Nc2+", "Kd2", "Nxa1", "a8=Q"]
  },
  {
    order: 453,
    fen: "3q4/5pPk/p3p2P/8/8/1Pp2P2/P1P5/1K4Q1 w - - 0 1",
    solution: ["g8=Q+", "Qxg8", "Qxg8+", "Kxg8", "b4"]
  },
  {
    order: 454,
    fen: "7k/p4q1p/3b1Pp1/1p4P1/3B1n2/P2P3P/1PP2P2/2K1R3 w - - 0 1",
    solution: ["Re8+", "Qxe8", "f7+", "Be5", "Bxe5+", "Qxe5", "f8=Q#"]
  },
  {
    order: 455,
    fen: "r2qkbn1/pp3ppr/2p3P1/3p4/Q3b3/2P5/PP2PPP1/RNB1KB2 w Qq - 0 1",
    solution: ["gxh7", "Nf6", "h8=Q"]
  },
  {
    order: 456,
    fen: "6K1/8/7p/8/k7/2B5/1P6/8 w - - 0 1",
    solution: ["Kf7", "h5", "Ke6", "h4", "Kd5", "Kb5", "Ke4", "h3", "Kf3", "h2", "Kg2", "h1=Q+", "Kxh1"]
  },
  {
    order: 457,
    fen: "k7/1qP5/1P6/KP6/8/7B/7p/8 w - - 0 1",
    solution: ["Bg2", "h1=Q", "Bxh1", "Qxh1", "c8=Q#"]
  },
  {
    order: 458,
    fen: "8/p1kP3p/4K1p1/2N2p2/1n6/8/6PP/8 w - - 0 1",
    solution: ["Na6+", "Nxa6", "Ke7", "Nc5", "d8=Q+"]
  },
  {
    order: 459,
    fen: "8/1n6/3k4/P7/8/8/8/K7 w - - 0 1",
    solution: ["a6", "Na5", "a7", "Nb3+", "Kb2", "Nd4", "a8=Q"]
  },
  {
    order: 460,
    fen: "8/p4p2/5k1P/1p2N1p1/2p1P1K1/2P5/PP6/2b5 w - - 0 1",
    solution: ["Kh5", "g4", "Nxg4+", "Ke7", "h7", "Bxb2", "h8=Q"]
  },
  {
    order: 461,
    fen: "6b1/6K1/7P/6k1/8/8/7P/8 w - - 0 1",
    solution: ["h3", "Kh5", "h4", "Kxh4", "Kxg8", "Kg5", "h7", "Kg6", "h8=Q"]
  },
  {
    order: 462,
    fen: "2k5/P2pP3/1p1P1pBK/1P6/5P1p/7p/8/4q2q w - - 0 1",
    solution: ["Be4", "Qhxe4", "e8=Q+", "Qxe8", "a8=Q#"]
  },
  {
    order: 463,
    fen: "6k1/pn4pp/2P5/8/2P5/1r6/P5PK/8 w - - 0 1",
    solution: ["c5", "Nxc5", "c7", "Ne6", "c8=Q+"]
  },
  {
    order: 464,
    fen: "8/2P5/8/8/3r4/8/2K5/k7 w - - 0 1",
    solution: ["c8=R", "Ra4", "Kb3", "Ra7", "Rc1#"]
  },
  {
    order: 465,
    fen: "5rk1/5ppp/4p3/3pP3/q2P4/1p2Q3/1P3P1P/1K4R1 w - - 0 1",
    solution: ["Rxg7+", "Kxg7", "Qg5+", "Kh8", "Qf6+", "Kg8", "Qg5+", "Kh8", "Qf6+"]
  },
  {
    order: 466,
    fen: "6k1/8/8/2n5/7P/1P3K2/2B5/8 b - - 0 1",
    solution: ["Nxb3", "Bxb3+", "Kh8"]
  },
  {
    order: 467,
    fen: "8/2k5/8/K7/7R/8/8/2q5 w - - 0 1",
    solution: ["Rc4+", "Qxc4"]
  },
  {
    order: 468,
    fen: "8/8/8/8/8/1k4q1/8/2KR4 w - - 0 1",
    solution: ["Rd3+", "Qxd3"]
  },
  {
    order: 469,
    fen: "8/8/8/8/8/5qk1/7R/6K1 w - - 0 1",
    solution: ["Rh3+", "Kxh3"]
  },
  {
    order: 470,
    fen: "8/8/8/8/p1k5/P1q5/K7/1R6 w - - 0 1",
    solution: ["Rc1", "Qxc1"]
  },
  {
    order: 471,
    fen: "1R6/8/8/5k2/5p2/7r/1p2K3/8 w - - 0 1",
    solution: ["Rxb2", "Rh2+", "Kf3", "Rxb2"]
  },
  {
    order: 472,
    fen: "K7/3n4/k4p2/5P1p/7P/8/4b3/1B6 w - - 0 1",
    solution: ["Bd3+", "Bxd3"]
  },
  {
    order: 473,
    fen: "8/8/pp6/kq5R/p4p1K/P1p2P1P/2P5/8 w - - 0 1",
    solution: ["Rf5", "Qxf5"]
  },
  {
    order: 474,
    fen: "k7/1p6/8/8/8/8/1q4rP/4Q2K w - - 0 1",
    solution: ["Qa5+", "Kb8", "Qd8+", "Ka7", "Qa5+", "Kb8", "Qd8+"]
  },
  {
    order: 475,
    fen: "5r1k/5npp/5p2/8/7N/7R/PP1q1r1P/1K6 w - - 0 1",
    solution: ["Ng6+", "Kg8", "Ne7+", "Kh8", "Ng6+"]
  },
  {
    order: 476,
    fen: "6Q1/8/8/3p4/8/5K2/7r/2q4k w - - 0 1",
    solution: ["Qg2+", "Rxg2"]
  },
  {
    order: 477,
    fen: "2k5/1R6/K7/7p/7P/8/2p5/8 w - - 0 1",
    solution: ["Rb5", "c1=Q", "Rc5+", "Qxc5"]
  },
  {
    order: 478,
    fen: "8/7p/p4Qpk/8/1q4PK/2p4P/8/8 w - - 0 1",
    solution: ["Qf4+", "Qxf4"]
  },
  {
    order: 479,
    fen: "7k/6p1/7p/8/1p6/pQqp4/P7/3K4 w - - 0 1",
    solution: ["Qg8+", "Kxg8"]
  },
  {
    order: 480,
    fen: "6b1/8/5k2/2p5/1pP5/pP6/P2q4/6QK w - - 0 1",
    solution: ["Qf2+", "Qxf2"]
  },
  {
    order: 481,
    fen: "8/8/5r2/6n1/5Q2/7k/5Kp1/8 w - - 0 1",
    solution: ["Kg1", "Rxf4"]
  },
  {
    order: 482,
    fen: "8/7P/4b1p1/2pp4/1p1k4/1P2p3/4K3/6q1 w - - 0 1",
    solution: ["h8=Q+", "Ke4", "Qh1+", "Qxh1"]
  },
  {
    order: 483,
    fen: "8/3p4/2p1pk2/4n3/5p2/5P1K/2r5/6Q1 w - - 0 1",
    solution: ["Qg5+", "Kxg5"]
  },
  {
    order: 484,
    fen: "8/8/8/8/3k4/6B1/p7/K2b2q1 w - - 0 1",
    solution: ["Bf2+", "Qxf2"]
  },
  {
    order: 485,
    fen: "6Q1/8/8/2n4p/7k/8/4K3/2q5 w - - 0 1",
    solution: ["Qg3+", "Kxg3"]
  },
  {
    order: 486,
    fen: "5bkr/1BR3p1/q6p/8/8/7r/PPP5/1K5R w - - 0 1",
    solution: ["Bd5+", "Kh7", "Be4+", "Kg8", "Bd5+"]
  },
  {
    order: 487,
    fen: "qk6/p7/P5p1/6p1/6Pp/7P/6BP/6K1 w - - 0 1",
    solution: ["Bf3", "Qxf3"]
  },
  {
    order: 488,
    fen: "8/8/7p/8/6P1/4b1k1/8/7K w - - 0 1",
    solution: ["g5", "Bxg5", "Kg1", "h5", "Kh1", "h4", "Kg1", "h3", "Kh1", "h2"]
  },
  {
    order: 489,
    fen: "8/r7/5kPK/7P/8/8/8/8 w - - 0 1",
    solution: ["g7", "Rxg7"]
  },
  {
    order: 490,
    fen: "5k2/8/8/3pp1p1/4b1Pp/3nP2P/4Q2K/r7 w - - 0 1",
    solution: ["Qf2+", "Ke7", "Qf7+", "Kd6", "Qd7+", "Kc5", "Qb5+", "Kd6", "Qc6+", "Ke7", "Qe6+", "Kd8", "Qd7+", "Kxd7"]
  },
  {
    order: 491,
    fen: "2q1r3/3p1Np1/B5p1/7k/8/4P1PP/7K/8 w - - 0 1",
    solution: ["Be2#"]
  },
  {
    order: 492,
    fen: "3r2rk/2Rn2pp/5p2/2p2P2/p4pRQ/3qP2P/6PK/8 w - - 0 1",
    solution: ["Qxh7+", "Kxh7", "Rh4#"]
  },
  {
    order: 493,
    fen: "r1b3k1/ppp2p2/3p1P2/2qPn1p1/4p3/2P3P1/PP2P1BP/R1Q4K w - - 0 1",
    solution: ["Qxg5+", "Kf8", "Qg7+", "Ke8", "Qg8+", "Kd7", "Bh3+", "Ng4", "Bxg4#"]
  },
  {
    order: 494,
    fen: "k3q3/p2r3p/P7/8/1Q6/Kp2r3/7P/2RB4 w - - 0 1",
    solution: ["Bf3+", "Rxf3", "Qe4+", "Qxe4", "Rc8#"]
  },
  {
    order: 495,
    fen: "r1bn1k1r/4bppp/pq6/1ppBNQ2/5B2/8/PP3PPP/R2R2K1 w - - 0 1",
    solution: ["Qxc8", "Rxc8", "Nd7+", "Kg8", "Nxb6", "Rc6", "Bxc6"]
  },
  {
    order: 496,
    fen: "8/4r1k1/p3npp1/4Q3/3P1P2/4P1P1/3q1N2/2R3K1 w - - 0 1",
    solution: ["Qxf6+", "Kxf6", "Ne4+", "Kf5", "Nxd2"]
  },
  {
    order: 497,
    fen: "8/8/2B2p2/1N3kp1/8/4K1BP/q7/8 w - - 0 1",
    solution: ["Be4+", "Ke6", "Bd5+", "Kxd5", "Nc3+", "Kc4", "Nxa2"]
  },
  {
    order: 498,
    fen: "6k1/6pp/4q3/5NP1/4B2P/6K1/8/8 w - - 0 1",
    solution: ["Bd5", "Qf7", "Bxf7+"]
  },
  {
    order: 499,
    fen: "5bk1/6np/6p1/3r1N2/8/7P/5P2/7K w - - 0 1",
    solution: ["Nh6+", "Kh8", "Nf7+", "Kg8", "Nh6+"]
  },
  {
    order: 500,
    fen: "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1",
    solution: ["Nxe5", "Bxd1", "Bxf7+", "Ke7", "Nd5#"]
  },
  {
    order: 501,
    fen: "1r1r4/1b3pk1/5qp1/pP1p3p/3N3P/3pP1P1/PQR2PB1/6K1 w - - 0 1",
    solution: ["Ne6+", "fxe6", "Rc7+", "Kg8", "Qxf6"]
  },
  {
    order: 502,
    fen: "rnb1k2r/pp2b1pp/2p2pn1/q3P2Q/5p2/PB6/1BPP2PP/RN2K1NR w KQkq - 0 1",
    solution: ["Bf7+", "Kf8", "Bxg6"]
  },
  {
    order: 503,
    fen: "8/1p1k4/1p6/3p4/4q1r1/1NKN4/8/3Q4 w - - 0 1",
    solution: ["Nbc5+", "bxc5", "Nxc5+", "Kd6", "Nxe4+"]
  },
  {
    order: 504,
    fen: "R7/P4k2/8/8/8/8/7K/r7 w - - 0 1",
    solution: ["Rh8", "Rxa7", "Rh7+", "Ke6", "Rxa7"]
  },
  {
    order: 505,
    fen: "8/2B5/8/6pp/7k/7P/5qPK/8 w - - 0 1",
    solution: ["Bd6", "g4", "Be7+", "Qf6", "Bxf6#"]
  },
  {
    order: 506,
    fen: "5rk1/ppq2ppp/2p5/4bN2/4P3/6Q1/PP3PPP/3R2K1 w - - 0 1",
    solution: ["Nh6+", "Kh8", "Qxe5", "Qxe5", "Nxf7+", "Kg8", "Nxe5"]
  },
  {
    order: 507,
    fen: "5rbk/p5p1/qn3p1p/4r3/2pNB3/b1P4R/P1QB1PPP/5RK1 w - - 0 1",
    solution: ["Bxh6", "gxh6", "Rxh6+", "Kg7", "Bb7", "Kxh6", "Bxa6"]
  },
  {
    order: 508,
    fen: "5rk1/1pq2ppp/p3n3/8/3N4/2P5/PP4PP/4RQ1K w - - 0 1",
    solution: ["Rxe6", "fxe6", "Qxf8+", "Kxf8", "Nxe6+", "Kf7", "Nxc7"]
  },
  {
    order: 509,
    fen: "3rr2k/ppp2q1p/3p1b1B/3Pp2n/2P5/3Q3P/PPB2P2/2KR2R1 w - - 0 1",
    solution: ["Bg7+", "Qxg7", "Rxg7", "Kxg7", "Qxh7+", "Kf8", "Qxh5"]
  },
  {
    order: 510,
    fen: "2N5/1n1p1k2/2b2p2/4pN2/1P2P3/5P1K/8/8 w - - 0 1",
    solution: ["b5", "Bxb5", "Ncd6+", "Nxd6", "Nxd6+", "Ke6", "Nxb5"]
  },
  {
    order: 511,
    fen: "6k1/R5bp/4p1p1/8/3n1N2/2q4P/6P1/3Q3K w - - 0 1",
    solution: ["Rxg7+", "Kxg7", "Qxd4+", "Qxd4", "Nxe6+", "Kf6", "Nxd4"]
  },
  {
    order: 512,
    fen: "k7/1q1P3p/5bp1/p2n4/8/5Q1B/PPP3PP/1K6 w - - 0 1",
    solution: ["Qxf6", "Nxf6", "d8=Q+", "Ka7", "Qxf6"]
  },
  {
    order: 513,
    fen: "r4rk1/1b3ppp/8/3N4/3R4/P7/1PP4R/1K6 w - - 0 1",
    solution: ["Ne7+", "Kh8", "Rxh7+", "Kxh7", "Rh4#"]
  },
  {
    order: 514,
    fen: "2k5/r2n3p/1Rp1qpp1/2pN4/4P3/1P1P3P/2P2QP1/6K1 w - - 0 1",
    solution: ["Rxc6+", "Qxc6", "Ne7+", "Kc7", "Nxc6"]
  },
  {
    order: 515,
    fen: "8/7p/6pP/5pP1/3kpP2/6P1/4K3/8 w - - 0 1",
    solution: ["g4", "fxg4", "f5", "gxf5", "g6", "hxg6", "h7", "g3", "h8=Q+"]
  },
  {
    order: 516,
    fen: "r5k1/p4qnp/1p4pB/2pr4/3p2P1/7P/PPP3Q1/R3R1K1 w - - 0 1",
    solution: ["Re7", "Qxe7", "Qxd5+", "Qf7", "Qxa8+"]
  },
  {
    order: 517,
    fen: "6R1/1br2kpp/p3pp2/1p6/1P1N4/P3PP2/3K2PP/8 w - - 0 1",
    solution: ["Rxg7+", "Kxg7", "Nxe6+", "Kg6", "Nxc7"]
  },
  {
    order: 518,
    fen: "5nk1/6pp/8/5N2/8/8/rq6/6RK w - - 0 1",
    solution: ["Nh6+", "Kh8", "Nf7+", "Kg8", "Nh6+"]
  },
  {
    order: 519,
    fen: "8/8/3k2qN/P7/1P2P3/8/2Kn4/5R2 w - - 0 1",
    solution: ["Rf6+", "Qxf6", "e5+", "Kxe5", "Ng4+", "Kd4"]
  },
  {
    order: 520,
    fen: "3rk2r/pp2ppbp/5p2/q2N4/3Q1P2/8/PPP3PP/2KR3R w k - 0 1",
    solution: ["Qa4+", "b5", "Qxb5+", "Qxb5", "Nc7+", "Kf8", "Rxd8+", "Qe8", "Rxe8#"]
  },
  {
    order: 521,
    fen: "r3r1k1/pp1n1ppp/2p5/4Pb2/2B2P2/B1P5/P5PP/R2R2K1 w - - 0 1",
    solution: ["e6", "Bxe6", "Bxe6", "Rxe6", "Rxd7"]
  },
  {
    order: 522,
    fen: "8/1p3pkp/2rQ1p2/3b1q2/5B2/P6P/1P2R1PK/8 w - - 0 1",
    solution: ["Qf8+", "Kxf8", "Bh6+", "Kg8", "Re8#"]
  },
  {
    order: 523,
    fen: "N7/P5P1/b2p1n2/8/4k3/8/7K/8 w - - 0 1",
    solution: ["Nc7", "Bb7", "Ne8", "Ng8", "Nxd6+", "Kd5", "Nxb7"]
  },
  {
    order: 524,
    fen: "5rk1/n1p1R1bp/p2p4/1q1P1QB1/7P/2P3P1/PP3P2/6K1 w - - 0 1",
    solution: ["Qe6+", "Kh8", "Rxg7", "Kxg7", "Bh6+", "Kh8", "Bxf8"]
  },
  {
    order: 525,
    fen: "3r2k1/n1q2ppp/8/8/8/5Q1P/5PP1/3R1BK1 w - - 0 1",
    solution: ["Qb7", "Qa5", "Qxa7", "Qxa7", "Rxd8#"]
  },
  {
    order: 526,
    fen: "3r1kr1/1p2bppp/2p5/8/3B2P1/3R4/1PP2PP1/1K2R3 w - - 0 1",
    solution: ["Bc5", "Re8", "Bxe7+", "Rxe7", "Rd8+", "Re8", "Rdxe8#"]
  },
  {
    order: 527,
    fen: "8/pp3p1p/1r2b1pk/q7/3Q4/1P3B1P/P4PPK/2R5 w - - 0 1",
    solution: ["Rc5", "Rb5", "Qf4+", "Kg7", "Qe5+", "f6", "Rxb5"]
  },
  {
    order: 528,
    fen: "1kq1Q3/pp3prp/2np4/3N2r1/8/6P1/P4P1P/2R1R1K1 w - - 0 1",
    solution: ["Rxc6", "Qxe8", "Rxe8#"]
  },
  {
    order: 529,
    fen: "1k1r4/pP2q3/8/Q7/8/6bP/P5P1/2R4K w - - 0 1",
    solution: ["Rc8+", "Rxc8", "Qxa7+", "Kxa7", "bxc8=N+", "Kb7", "Nxe7"]
  },
  {
    order: 530,
    fen: "k7/2pR4/1p6/4q3/1NP5/1P3K2/8/8 w - - 0 1",
    solution: ["Rd8+", "Kb7", "Rb8+", "Kxb8", "Nc6+", "Kb7", "Nxe5"]
  },
  {
    order: 531,
    fen: "2K5/pP6/2N5/8/8/2k5/6p1/8 w - - 0 1",
    solution: ["Nd4", "Kxd4", "b8=Q", "g1=Q", "Qxa7+", "Kc4", "Qxg1"]
  },
  {
    order: 532,
    fen: "r4k1r/pp3ppp/1bppbq2/4n3/3pPB2/1B1P2Q1/PPPN2PP/R4RK1 w - - 0 1",
    solution: ["Bxe5", "Qxe5", "Qxe5", "dxe5", "Bxe6"]
  },
  {
    order: 533,
    fen: "1q3bk1/5p1r/7P/8/n5N1/2Q5/1B6/1K6 w - - 0 1",
    solution: ["Qh8+", "Rxh8", "Nf6#"]
  },
  {
    order: 534,
    fen: "2r4k/1p1R1B1p/6p1/6q1/8/P2P2PP/5P1K/2b1Q3 w - - 0 1",
    solution: ["Rd8+", "Rxd8", "Qc3+", "Qf6", "Qxf6#"]
  },
  {
    order: 535,
    fen: "r3r2k/p2b1Rp1/1pp2Np1/3q4/3n4/4Q3/PP4PP/3R2K1 w - - 0 1",
    solution: ["Qh6+", "gxh6", "Rh7#"]
  },
  {
    order: 536,
    fen: "r2q4/3rk3/1pRp3p/1P1PpRpP/p3P1P1/PpQ5/1K6/8 w - - 0 1",
    solution: ["Qxe5+", "dxe5", "Re6#"]
  },
  {
    order: 537,
    fen: "4r1r1/pQ5p/1qp2R2/2k1p3/P3P3/2PP4/2P3PP/6K1 w - - 0 1",
    solution: ["Rxc6+", "Qxc6", "Qb4#"]
  },
  {
    order: 538,
    fen: "6k1/2r3b1/R1p1r1pp/8/3P4/4P2P/3N1PB1/6K1 w - - 0 1",
    solution: ["Bd5", "cxd5", "Rxe6"]
  },
  {
    order: 539,
    fen: "1kr3r1/pp2qp2/1n5p/4b1p1/6P1/1Q3BN1/PP1R2P1/1K1R4 w - - 0 1",
    solution: ["Rd7", "Qxd7", "Rxd7"]
  },
  {
    order: 540,
    fen: "2r3k1/pr3pp1/4pnqp/4B3/b1BP3Q/P4P2/6PP/2R1R1K1 w - - 0 1",
    solution: ["Bd3", "Qg5", "Qxg5", "hxg5", "Rxc8+"]
  },
  {
    order: 541,
    fen: "r2q1rk1/2pbbpp1/p4B1p/1n1pP1NQ/2p5/2P5/P1B2PPP/R4RK1 w - - 0 1",
    solution: ["Qxh6", "gxh6", "Bh7#"]
  },
  {
    order: 542,
    fen: "r7/2p1r1bk/3p2pp/PP3p2/2Q5/2q2PP1/R3PNK1/7R w - - 0 1",
    solution: ["Rxh6+", "Bxh6", "Qxc3"]
  },
  {
    order: 543,
    fen: "r1b1r1k1/5p1p/p1n1qBp1/3R4/7Q/2p2N2/PPB2PPP/6K1 w - - 0 1",
    solution: ["Qxh7+", "Kxh7", "Rh5+", "Kg8", "Rh8#"]
  },
  {
    order: 544,
    fen: "1r4rk/5b1q/7Q/3p3P/2pP4/P1P5/KP3P2/6R1 w - - 0 1",
    solution: ["Qf6+", "Rg7", "h6", "Rbg8", "Rh1"]
  },
  {
    order: 545,
    fen: "r4r1k/6qp/p1b1BpPQ/1p2p1n1/4P3/2N5/PPP5/1K4RR w - - 0 1",
    solution: ["Rxg5", "Qxh6", "Rxh6", "fxg5", "Rxh7#"]
  },
  {
    order: 546,
    fen: "1r1qk2r/p3n3/2R1Q2p/1R1p2pP/2pPb3/2P5/4NPP1/6K1 w k - 0 1",
    solution: ["Qe5", "Rxb5", "Qxh8+", "Kd7", "Rd6+", "Kxd6", "Qxd8+"]
  },
  {
    order: 547,
    fen: "6k1/5ppp/pB6/3br3/Pp6/5QPq/1P3P1P/2R3K1 w - - 0 1",
    solution: ["g4", "Bxf3", "Rc8+", "Re8", "Rxe8#"]
  },
  {
    order: 548,
    fen: "r6k/p3Nppp/1p6/5Q2/4R3/4P3/1r3PqP/4KR2 w - - 0 1",
    solution: ["Qxh7+", "Kxh7", "Rh4#"]
  },
  {
    order: 549,
    fen: "r1bkr3/ppp2Q1p/3p4/2qNb3/2B5/3P4/PPP3PP/4R2K w - - 0 1",
    solution: ["b4", "Qc6", "Bb5", "Qxc2", "Qxe8#"]
  },
  {
    order: 550,
    fen: "1r4b1/3R4/5kp1/2nBppN1/7P/4P3/5PP1/6K1 w - - 0 1",
    solution: ["Nh7+", "Bxh7", "Rf7#"]
  },
  {
    order: 551,
    fen: "1rq5/7p/3bQppk/3Pp3/4P2N/6PK/7P/5B2 w - - 0 1",
    solution: ["Nf5+", "gxf5", "Qxf6+", "Kh5", "Be2#"]
  },
  {
    order: 552,
    fen: "R7/P1r2p2/4p3/2b1PkPp/3p1B2/6P1/5P1K/8 w - - 0 1",
    solution: ["g6", "Bxa7", "g7", "d3", "g8=Q"]
  },
  {
    order: 553,
    fen: "1n3q1k/r2r3p/p3Q3/1p6/8/2P3R1/P4PPP/4R1K1 w - - 0 1",
    solution: ["Qf6+", "Qxf6", "Re8+", "Qf8", "Rxf8#"]
  },
  {
    order: 554,
    fen: "8/p1Q1qk2/1pP2pp1/6p1/6P1/7P/P4P2/6K1 w - - 0 1",
    solution: ["Qb7", "Ke8", "c7"]
  },
  {
    order: 555,
    fen: "5rk1/R1R4p/3p2p1/5p2/8/6QP/1qr3PK/8 w - - 0 1",
    solution: ["Qb3+", "Kh8", "Qxb2+", "Rxb2", "Rxh7+", "Kg8", "Rag7#"]
  },
  {
    order: 556,
    fen: "4R3/pp3pkn/6p1/2rN1qPp/7P/8/PPP5/2K4Q w - - 0 1",
    solution: ["Rg8+", "Kxg8", "Ne7+", "Kg7", "Nxf5+"]
  },
  {
    order: 557,
    fen: "3r3k/4R3/4B2p/8/4r1P1/3b4/5P2/3R2K1 w - - 0 1",
    solution: ["Rh7+", "Kxh7", "Bf5+", "Kg8", "Bxe4"]
  },
  {
    order: 558,
    fen: "2b5/4q1kp/p4np1/P7/1n6/2N4P/5QP1/1R4BK w - - 0 1",
    solution: ["Rxb4", "Qxb4", "Qxf6+", "Kxf6", "Nd5+", "Ke5", "Nxb4"]
  },
  {
    order: 559,
    fen: "7k/1b4b1/p2rq2p/6p1/8/4N1Q1/1BR2P1P/6K1 w - - 0 1",
    solution: ["Bxg7+", "Kxg7", "Qxd6", "Qxd6", "Nf5+", "Kf6", "Nxd6"]
  },
  {
    order: 560,
    fen: "3r1bk1/3q2pp/8/3p1NQ1/P5PP/1P1R3K/8/8 w - - 0 1",
    solution: ["Nh6+", "Kh8", "Qxd8", "Qxd8", "Nf7+", "Kg8", "Nxd8"]
  },
  {
    order: 561,
    fen: "3rb1k1/1p1q2p1/p2r2B1/6Q1/3P4/5RR1/6PP/6K1 w - - 0 1",
    solution: ["Bf7+", "Qxf7", "Rxf7", "Bxf7", "Qxg7#"]
  },
  {
    order: 562,
    fen: "r2r2kb/pp1bpp1p/2np1npB/q1p5/4PP2/2NP2PP/PPPQN1B1/R4RK1 w - - 0 1",
    solution: ["e5", "Ne8", "Bxc6", "Bxc6", "Nd5", "Bxd5", "Qxa5"]
  },
  {
    order: 563,
    fen: "4R3/6p1/p3p3/p1p1Pq2/2PkN3/3P4/2PK1P2/8 w - - 0 1",
    solution: ["Rf8", "Qxf8", "Nf6", "gxf6", "f4", "fxe5", "c3#"]
  },
  {
    order: 564,
    fen: "r3rb1k/3b1pR1/p2p1P1p/q4P2/1p1B2Q1/1P6/1PP3PP/2K5 w - - 0 1",
    solution: ["Rg8+", "Kh7", "Qg6+", "fxg6", "fxg6+", "Kxg8", "f7#"]
  },
  {
    order: 565,
    fen: "7k/p2R4/2p2p1P/5K2/1PP5/8/r2B2pb/8 w - - 0 1",
    solution: ["Bg5", "fxg5", "Kg6", "g1=Q", "Rd8#"]
  },
  {
    order: 566,
    fen: "rk5r/ppp1bq1p/2n5/2N3B1/6Q1/8/PPP2PPP/R5K1 w - - 0 1",
    solution: ["Nd7+", "Kc8", "Nb6+", "Kb8", "Qc8+", "Rxc8", "Nd7#"]
  },
  {
    order: 567,
    fen: "6k1/R5P1/1K6/3rp3/3p4/8/8/8 w - - 0 1",
    solution: ["Ra8+", "Kxg7", "Kc6", "Rb5", "Kxb5"]
  },
  {
    order: 568,
    fen: "8/4k1pq/4r2p/2p2p2/2P5/1P3N1N/6PP/4R1K1 w - - 0 1",
    solution: ["Rxe6+", "Kxe6", "Nhg5+", "hxg5", "Nxg5+", "Ke5", "Nxh7"]
  },
  {
    order: 569,
    fen: "4qrk1/6p1/p5P1/1p3r2/1Bn5/P7/1P2P3/K1NQ2RR w - - 0 1",
    solution: ["Rh8+", "Kxh8", "Rh1+", "Kg8", "Rh8+", "Kxh8", "Qh1+", "Kg8", "Qh7#"]
  },
  {
    order: 570,
    fen: "8/3b3k/4p2n/pp2Rp1Q/P3B1p1/1q4P1/5PK1/8 w - - 0 1",
    solution: ["Bxf5+", "exf5", "Re7+", "Kg8", "Qg6+", "Kh8", "Qg7#"]
  },
  {
    order: 571,
    fen: "rnb2r1k/pp2p2p/2pp2p1/q2P1p2/8/1Pb2NP1/PB2PPBP/R2Q1RK1 w - - 0 1",
    solution: ["Qd2", "Kg8", "Bxc3"]
  },
  {
    order: 572,
    fen: "6k1/p5p1/qp2P2p/7P/8/6P1/r5QP/6K1 w - - 0 1",
    solution: ["Qa8+", "Kh7", "Qe4+", "Kg8", "Qa8+"]
  },
  {
    order: 573,
    fen: "4rk2/1pq2Pb1/2p4Q/p7/P1n5/2P4P/2P5/R6K w - - 0 1",
    solution: ["Qxg7+", "Kxg7", "fxe8=N+", "Kf7", "Nxc7"]
  },
  {
    order: 574,
    fen: "3r3k/1pp1q2n/2np1p2/1B2pQ2/3PP3/2P2PB1/1P3K2/7R w - - 0 1",
    solution: ["Bxc6", "bxc6", "Rxh7+", "Qxh7", "Qxf6+", "Kg8", "Qxd8+"]
  },
  {
    order: 575,
    fen: "5r1k/6p1/5pPp/2pBpP1P/p2nP3/q7/3Q4/6RK w - - 0 1",
    solution: ["Qxh6+", "gxh6", "g7+", "Kh7", "gxf8=N+", "Kh8", "Rg8#"]
  },
  {
    order: 576,
    fen: "r4rk1/p1q2ppp/1p1b4/n2P4/Q7/3BPN2/P5P1/R4R1K w - - 0 1",
    solution: ["Bxh7+", "Kxh7", "Qh4+", "Kg8", "Ng5", "Rfe8", "Qh7+", "Kf8", "Rxf7+", "Qxf7", "Nxf7"]
  },
  {
    order: 577,
    fen: "2r2r1k/6pp/2NN4/5p2/2Q2nq1/8/6PP/2R4K w - - 0 1",
    solution: ["Qg8+", "Kxg8", "Ne7+", "Kh8", "Nf7+", "Rxf7", "Rxc8+", "Rf8", "Rxf8#"]
  },
  {
    order: 578,
    fen: "1r6/RN1nbkpp/5p2/8/3Np3/8/4KPPP/8 w - - 0 1",
    solution: ["Nd6+", "Bxd6", "Rxd7+", "Be7", "Rxe7+", "Kxe7", "Nc6+", "Kd7", "Nxb8+"]
  },
  {
    order: 579,
    fen: "r1bqrk2/pp2bppB/2pn3p/3pN2Q/3P1P2/2N5/PP4PP/R4RK1 w - - 0 1",
    solution: ["Qxf7+", "Nxf7", "Ng6#"]
  },
  {
    order: 580,
    fen: "1B6/1P6/8/8/8/3k4/6r1/K7 w - - 0 1",
    solution: ["Bg3", "Rxg3", "b8=Q"]
  },
  {
    order: 581,
    fen: "3R1rk1/6pp/3Q4/5qP1/4Nn2/7P/6P1/6K1 w - - 0 1",
    solution: ["Nf6+", "Qxf6", "gxf6"]
  },
  {
    order: 582,
    fen: "q4r1k/5p1p/p2pp2Q/1p2b3/8/2P2R2/P1P4P/6RK w - - 0 1",
    solution: ["Rg2", "Qxf3", "Qxf8#"]
  },
  {
    order: 583,
    fen: "6k1/p2p1ppp/8/P7/3R4/3P2P1/1qrQ1P1K/8 w - - 0 1",
    solution: ["Rc4", "Rxc4", "Qxb2"]
  },
  {
    order: 584,
    fen: "1R6/1brk2p1/4p2p/p1P1Pp2/P7/6P1/1P4P1/2R3K1 w - - 0 1",
    solution: ["Rxb7", "Rxb7", "c6+", "Kc7", "cxb7+"]
  },
  {
    order: 585,
    fen: "4rk2/p1p3p1/1nNp1n1p/8/8/1B5P/1Q1BqPP1/6K1 w - - 0 1",
    solution: ["Qxf6+", "gxf6", "Bxh6#"]
  },
  {
    order: 586,
    fen: "5rk1/5pbp/6p1/1q3N2/3B4/4Q1PP/1p3P1K/2n5 w - - 0 1",
    solution: ["Qh6", "Bxh6", "Nxh6#"]
  },
  {
    order: 587,
    fen: "3n1k2/2Q1R3/5Pb1/3q4/8/8/3p2P1/6K1 w - - 0 1",
    solution: ["Re8+", "Kxe8", "Qe7#"]
  },
  {
    order: 588,
    fen: "1b6/3K4/Pk6/8/8/R7/8/8 w - - 0 1",
    solution: ["Kc8", "Ba7", "Ra2", "Kb5", "Kb7", "Bb6", "a7", "Bxa7", "Kxa7"]
  },
  {
    order: 589,
    fen: "3r4/3r4/1pb3p1/2pp1p2/p3k2p/PB2P3/1PP2PPP/4RNK1 w - - 0 1",
    solution: ["f4", "g5", "Nd2#"]
  },
  {
    order: 590,
    fen: "5rk1/1n3pp1/7p/4N3/7q/Q6P/PP4P1/1K3R2 w - - 0 1",
    solution: ["Qxf8+", "Kxf8", "Ng6+", "Ke8", "Nxh4"]
  },
  {
    order: 591,
    fen: "1r2k3/3n1p2/4q1p1/6Bp/8/1Q6/PP4PP/1K1R4 w - - 0 1",
    solution: ["Qxb8+", "Nxb8", "Rd8#"]
  },
  {
    order: 592,
    fen: "6k1/4p3/5p1p/R5b1/8/7P/2Nr1PP1/4K3 w - - 0 1",
    solution: ["Rxg5+", "hxg5", "Kxd2"]
  },
  {
    order: 593,
    fen: "5rk1/ppp1qn1p/3pB1pr/3Pp3/2P1Pn2/PPB5/1Q4RP/5RK1 w - - 0 1",
    solution: ["Rxf4", "exf4", "Bh8", "Qxe6", "Qg7#"]
  },
  {
    order: 594,
    fen: "2R1r1k1/pp2pr1p/4QnpB/8/3q4/8/P4PPP/4R1K1 w - - 0 1",
    solution: ["Qxf6", "exf6", "Rcxe8+", "Rf8", "Rxf8#"]
  },
  {
    order: 595,
    fen: "4rk2/1pp3p1/p6p/4b1n1/6N1/2N4P/PPP2PP1/3R2K1 w - - 0 1",
    solution: ["f4", "Bxf4", "Rf1", "Ne6", "g3"]
  },
  {
    order: 596,
    fen: "r4rk1/ppp2ppp/2n5/2bqp3/8/P2PB3/1PP1NPPP/R2Q1RK1 w - - 0 1",
    solution: ["Nc3", "Qd6", "Ne4", "Qe7", "Bxc5", "Qd7", "Bxf8"]
  },
  {
    order: 597,
    fen: "7k/3r2pp/1p6/p4q2/1bP1R3/3r2B1/4QPPP/R5K1 w - - 0 1",
    solution: ["Bd6", "Bxd6", "Qxd3"]
  },
  {
    order: 598,
    fen: "6k1/3b1ppp/1p4r1/7q/7B/r5P1/P1Q2P1K/1R2R3 w - - 0 1",
    solution: ["Qc8+", "Bxc8", "Re8#"]
  },
  {
    order: 599,
    fen: "2Q5/4r2k/2pbBn1p/1p6/3B3q/7P/p4PP1/6K1 w - - 0 1",
    solution: ["Qg8+", "Nxg8", "Bf5#"]
  },
  {
    order: 600,
    fen: "5k2/r5pp/5pP1/6n1/6R1/7P/4B1PK/8 w - - 0 1",
    solution: ["Rxg5", "hxg6", "Rxg6"]
  },
  {
    order: 601,
    fen: "r1b2rk1/p4ppp/1p6/2pNq3/5N2/P7/1P4PQ/K1R5 w - - 0 1",
    solution: ["Ng6", "hxg6", "Qxe5"]
  },
  {
    order: 602,
    fen: "6R1/kp2qp2/p4p2/PP6/3br1P1/2PQ4/1K6/8 w - - 0 1",
    solution: ["Qxd4+", "Rxd4", "b6#"]
  },
  {
    order: 603,
    fen: "6k1/q5p1/1p4N1/2p2P2/8/8/1PP5/2KR4 w - - 0 1",
    solution: ["Rd8+", "Kf7", "Rf8#"]
  },
  {
    order: 604,
    fen: "r5k1/2p2ppp/1pn5/p7/4n3/P1P2N1P/BP3PP1/5RK1 w - - 0 1",
    solution: ["Bd5", "Re8", "Bxc6"]
  },
  {
    order: 605,
    fen: "8/8/pppn2pp/2k1pq2/P7/2PP1P1Q/1P2P3/7K w - - 0 1",
    solution: ["b4+", "Kd5", "e4+", "Ke6", "exf5+"]
  },
  {
    order: 606,
    fen: "4r1k1/5p1p/5qpB/1P1b4/P2R4/2Q4P/5PP1/7K w - - 0 1",
    solution: ["Re4", "Rxe4", "Qxf6"]
  },
  {
    order: 607,
    fen: "2k5/8/3K4/1r6/8/8/8/4R3 w - - 0 1",
    solution: ["Kc6", "Kb8", "Kxb5"]
  },
  {
    order: 608,
    fen: "1b3rk1/2q3p1/p7/1pp3N1/7P/2PB2n1/1PQ3P1/4R1K1 w - - 0 1",
    solution: ["Bxb5", "g6", "Bxa6"]
  },
  {
    order: 609,
    fen: "6k1/p3b3/5p2/2p1p3/2P1P3/5P2/P7/nN2B1K1 w - - 0 1",
    solution: ["Na3", "Kf7", "Bc3", "Ke6", "Bxa1"]
  },
  {
    order: 610,
    fen: "r3rk2/2p1qp2/1p1n2p1/p6p/3N1P2/1P2P3/P5PP/Q2R1RK1 w - - 0 1",
    solution: ["Nc6", "Kg8", "Nxe7+"]
  },
  {
    order: 611,
    fen: "2kr3r/ppp2pp1/1bnp2qp/3Np3/1PB1P1b1/2PP1N2/P3QPPP/R3K2R w KQ - 0 1",
    solution: ["b5", "Rhe8", "bxc6"]
  },
  {
    order: 612,
    fen: "3r2k1/1p3ppp/p7/2b2n2/8/1B3N1P/PP3PP1/4R1K1 w - - 0 1",
    solution: ["Re5", "Be7", "Rxf5"]
  },
  {
    order: 613,
    fen: "5k2/4b2p/7N/8/p7/1pPqP3/1P3P2/2K3R1 w - - 0 1",
    solution: ["Rg8#"]
  },
  {
    order: 614,
    fen: "4r2k/p2R1Qp1/1p5p/7P/q1p5/2b3B1/PP2rPP1/K2R4 w - - 0 1",
    solution: ["Be5", "Bxe5", "Qxe8+", "Kh7", "Rxg7+", "Kxg7", "Qxa4"]
  },
  {
    order: 615,
    fen: "3r2k1/p7/1p4p1/3q1p1p/5P1P/6PK/P3R3/3Q4 w - - 0 1",
    solution: ["Re8+", "Kf7", "Rxd8"]
  },
  {
    order: 616,
    fen: "rr4k1/1q3ppp/1bQ1p3/8/5P2/P2R3P/1PN3P1/K3R3 w - - 0 1",
    solution: ["Rd8+", "Rxd8", "Qxb7"]
  },
  {
    order: 617,
    fen: "rq3b1k/pbR3p1/1p2pN1p/7Q/7P/3B4/PPP2Pr1/2K4R w - - 0 1",
    solution: ["Qxh6+", "gxh6", "Rh7#"]
  },
  {
    order: 618,
    fen: "6k1/p2nr2p/4N1p1/2PpQ3/1p1P4/2q4P/5RP1/6K1 w - - 0 1",
    solution: ["Qb8+", "Nxb8", "Rf8#"]
  },
  {
    order: 619,
    fen: "1R6/2p2p2/kpN5/5p2/2P5/Pq2PPPK/8/8 w - - 0 1",
    solution: ["Nb4+", "Ka7", "Nc6+", "Ka6", "Nb4+", "Ka5", "Nc6+", "Ka6"]
  },
  {
    order: 620,
    fen: "r5k1/pp2rpp1/2n4p/4P3/2PpR3/P2P3q/6R1/Q4BK1 w - - 0 1",
    solution: ["Rxg7+", "Kxg7", "Bxh3"]
  },
  {
    order: 621,
    fen: "r4rk1/ppq2ppp/3p4/n2Qp3/7b/2P5/PPB2PPP/R1B2RK1 w - - 0 1",
    solution: ["Qe4", "g6", "Qxh4"]
  },
  {
    order: 622,
    fen: "2k5/pp2b1pp/2p5/8/4n3/1P5P/P4PP1/5RK1 w - - 0 1",
    solution: ["Re1", "Nf6", "Rxe7"]
  },
  {
    order: 623,
    fen: "3k4/1pp2pp1/1b4r1/pP2p3/P3P3/5qNb/2Q2P1P/4B1KR w - - 0 1",
    solution: ["Qd1+", "Qxd1"]
  },
  {
    order: 624,
    fen: "2k4r/pppr2pp/8/3q4/N4n2/Q1R4P/PP3PP1/5RK1 w - - 0 1",
    solution: ["Nb6+", "Kb8", "Nxd5"]
  },
  {
    order: 625,
    fen: "8/1p3kpp/p4p2/3N4/8/1P5P/Pr1n1PP1/R3K3 w Q - 0 1",
    solution: ["O-O-O", "Rxa2", "Rxd2"]
  },
  {
    order: 626,
    fen: "2k5/pp6/8/3b4/8/8/4B3/1K6 w - - 0 1",
    solution: ["Ba6", "Kc7", "Bxb7"]
  },
  {
    order: 627,
    fen: "6k1/pp4bp/2p3n1/8/3P3P/2P5/PPK5/6R1 w - - 0 1",
    solution: ["h5", "Ne7", "h6"]
  },
  {
    order: 628,
    fen: "r2q2k1/1ppb1Rp1/6Bp/8/8/5Q2/P5PP/6K1 w - - 0 1",
    solution: ["Rxg7+", "Kxg7", "Qf7+", "Kh8", "Qh7#"]
  },
  {
    order: 629,
    fen: "1r1r2k1/R4p1p/2p1p1q1/8/4R3/1P6/1KP2QPP/8 w - - 0 1",
    solution: ["Rg4", "Qxg4", "Qxf7+", "Kh8", "Qxh7#"]
  },
  {
    order: 630,
    fen: "r4rk1/1pq1n1p1/p2pbP2/5p1Q/8/2P4R/P1PB2PP/R6K w - - 0 1",
    solution: ["f7+", "Bxf7", "Qh7#"]
  },
  {
    order: 631,
    fen: "8/5ppp/8/5PPP/1k6/8/1K6/8 w - - 0 1",
    solution: ["g6", "hxg6", "f6", "gxf6", "h6"]
  },
  {
    order: 632,
    fen: "3rn2k/ppb2rpp/2ppqp2/5N2/2P1P3/1P5Q/PB3PPP/3RR1K1 w - - 0 1",
    solution: ["Nh6", "Qe7", "Nxf7+"]
  },
  {
    order: 633,
    fen: "8/p2nk3/1p4r1/8/8/5N2/6PP/3R3K w - - 0 1",
    solution: ["Rxd7+", "Kxd7", "Ne5+", "Ke6", "Nxg6"]
  },
  {
    order: 634,
    fen: "r1b1rnk1/1p4pp/p1p2p2/3pN2n/3P1PPq/3BPR1P/PPQ5/2R3K1 w - - 0 1",
    solution: ["Bxh7+", "Nxh7", "Ng6", "Bd7", "Nxh4"]
  },
  {
    order: 635,
    fen: "2br1rk1/1p2bpp1/p1p2n1p/q3Np2/PnBPP3/2N3B1/1P2Q1PP/R4RK1 w - - 0 1",
    solution: ["Bxf7+", "Rxf7", "Nc4"]
  },
  {
    order: 636,
    fen: "4r1k1/p4p1p/b4Qp1/2BN4/2qP4/6P1/5PP1/6K1 w - - 0 1",
    solution: ["Bf8", "Rxf8", "Ne7#"]
  },
  {
    order: 637,
    fen: "rnbq1r2/ppp1p1kp/3p2p1/3B1pN1/2Pb4/6P1/PP2PP1P/RNQ2RK1 w - - 0 1",
    solution: ["Bxb7", "h6", "Ne6+", "Bxe6", "Bxa8"]
  },
  {
    order: 638,
    fen: "2krr3/1p1n2pn/p2R1bp1/2P2p2/NP3BP1/P6P/4B1K1/5R2 w - - 0 1",
    solution: ["Rc6+", "bxc6", "Bxa6#"]
  },
  {
    order: 639,
    fen: "r2qkb1r/ppp2ppp/2np4/8/3Pn3/2P2N2/PP2BPPP/RNBQK2R w KQkq - 0 1",
    solution: ["d5", "Na5", "Qa4+", "c6", "Qxe4+"]
  },
  {
    order: 640,
    fen: "7b/2rNqp1k/p6p/1p6/4nN1P/P2QP3/1P4R1/1K6 w - - 0 1",
    solution: ["Ne6", "Rxd7", "Qxe4+", "f5", "Qxf5#"]
  },
  {
    order: 641,
    fen: "5K2/3B3k/8/8/6N1/8/8/7r w - - 0 1",
    solution: ["Bf5+", "Kh8", "Ne5", "Rh7", "Ng6#"]
  },
  {
    order: 642,
    fen: "6k1/5p1p/8/8/8/8/q1r4P/2Q4K w - - 0 1",
    solution: ["Qg5+", "Kf8", "Qd8+", "Kg7", "Qg5+", "Kf8", "Qd8+"]
  },
  {
    order: 643,
    fen: "1k1r1bnr/pp1b1q1p/2pP1p2/2P5/5B2/R7/PPP1Q1PP/4R2K w - - 0 1",
    solution: ["Qe7", "Qe8", "Qxe8", "Rxe8", "Rxe8+", "Bxe8", "d7+", "Ka8", "d8=Q#"]
  },
  {
    order: 644,
    fen: "4Qbk1/5p2/5Pp1/ppqn1rPp/7P/P1P5/1P2R3/1K1R4 w - - 0 1",
    solution: ["Re7", "Qxe7", "fxe7"]
  },
  {
    order: 645,
    fen: "6k1/R4pbp/b5p1/q2P4/4Q3/6N1/1P3PPP/2r1B1K1 w - - 0 1",
    solution: ["Qe8+", "Bf8", "Qxf7+", "Kh8", "Qxh7#"]
  },
  {
    order: 646,
    fen: "r1br1nk1/1p2bpp1/p1pp1n1p/q3p3/P2PP3/2N1BN1P/BPPQ1PP1/R3R1K1 w - - 0 1",
    solution: ["Nd5", "Qxd2", "Nxe7+", "Kh8", "Bxd2"]
  },
  {
    order: 647,
    fen: "r2r2k1/2q2ppp/8/pp1RP3/8/1pP1Q3/1P3PPP/3R2K1 w - - 0 1",
    solution: ["Qa7", "Qxa7", "Rxd8+", "Rxd8", "Rxd8#"]
  },
  {
    order: 648,
    fen: "4r2k/ppp2Qpp/8/8/3n4/2N5/1P4PP/4qR1K w - - 0 1",
    solution: ["Ne4", "Qxf1+", "Qxf1"]
  },
  {
    order: 649,
    fen: "4rrk1/pp3Npp/2p1Q3/8/8/7P/PP3bPK/8 w - - 0 1",
    solution: ["Nh6+", "Kh8", "Qg8+", "Rxg8", "Nf7#"]
  },
  {
    order: 650,
    fen: "5r1k/3rbppp/p2p1n2/1p2q3/3QPN2/1B5R/PPP3PP/5R1K w - - 0 1",
    solution: ["Bxf7", "Rxf7", "Ng6+", "Kg8", "Nxe5"]
  },
  {
    order: 651,
    fen: "5rk1/p3qp2/1b2n1p1/1p1p2Np/2b5/4P2P/1B3PP1/1BRQ2K1 w - - 0 1",
    solution: ["Qxh5", "gxh5", "Bh7#"]
  },
  {
    order: 652,
    fen: "2r4k/p5qp/1p3p2/2p3bP/4QB2/P7/1PP5/1K4R1 w - - 0 1",
    solution: ["Rxg5", "fxg5", "Be5", "Kg8", "Bxg7"]
  },
  {
    order: 653,
    fen: "3q1rk1/1b1p1p2/r4n1Q/pp1pB1N1/8/8/P1B2bPP/7K w - - 0 1",
    solution: ["Qh7+", "Nxh7", "Bxh7#"]
  },
  {
    order: 654,
    fen: "4r3/p2p2pk/1qp1pb2/8/8/1P2N3/P4PPP/2RQ2K1 w - - 0 1",
    solution: ["Qh5+", "Kg8", "Qxe8+"]
  },
  {
    order: 655,
    fen: "3rk2r/2p1qppp/2p3n1/p3P3/2PN3P/P5P1/1P2PP2/R2QK2R w KQk - 0 1",
    solution: ["Nxc6", "Rxd1+", "Rxd1", "O-O", "Nxe7+"]
  },
  {
    order: 656,
    fen: "2r5/5r1p/8/3p1p2/2P5/2PNk3/1K4PP/7R w - - 0 1",
    solution: ["Kc2", "dxc4", "Re1#"]
  },
  {
    order: 657,
    fen: "4r2r/1ppk1ppp/p2b4/7q/3P2b1/4BN2/PPP1BPPP/3QK2R w K - 0 1",
    solution: ["Ne5+", "Bxe5", "Bxg4+", "Qxg4", "Qxg4+", "Ke7", "dxe5"]
  },
  {
    order: 658,
    fen: "3q4/4np1b/4pk2/8/1Pn2B1K/4QB2/8/8 w - - 0 1",
    solution: ["Be5+", "Nxe5", "Qg5#"]
  },
  {
    order: 659,
    fen: "8/pp2r1kp/q1pRbpp1/2Pn4/r7/P3P1P1/1Q1N1PBP/1R4K1 w - - 0 1",
    solution: ["Bxd5", "Bxd5", "Qxf6+", "Kh6", "Qxe7"]
  },
  {
    order: 660,
    fen: "8/pp4pp/2p1kp2/b7/2nP4/3K3P/PP3PP1/2B1N3 w - - 0 1",
    solution: ["b4", "Bxb4", "Nc2", "Bd2", "Bxd2", "Nxd2", "Kxd2"]
  },
  {
    order: 661,
    fen: "1K6/7P/k7/1p1r4/1P6/8/8/8 w - - 0 1",
    solution: ["h8=R", "Rd8+", "Rxd8", "Kb6", "Rd6#"]
  },
  {
    order: 662,
    fen: "4rk2/1pq2p2/r2nP3/p3p3/P6Q/3R4/1PP5/3R2K1 w - - 0 1",
    solution: ["e7+", "Rxe7", "Qh8#"]
  },
  {
    order: 663,
    fen: "2r5/2P4R/p3kp1p/n3pNpP/1b2P1P1/4B3/5P2/6K1 w - - 0 1",
    solution: ["Bd2", "Bc5", "Bxa5"]
  },
  {
    order: 664,
    fen: "2r2bk1/ppqr1p1p/2n3p1/3B4/4Q3/6P1/PB3P1P/2R1R1K1 w - - 0 1",
    solution: ["Rxc6", "bxc6", "Qd4", "Rxd5", "Qh8#"]
  },
  {
    order: 665,
    fen: "8/3P4/6k1/6B1/8/8/p5n1/3K4 w - - 0 1",
    solution: ["Bf6", "Kxf6", "d8=Q+"]
  },
  {
    order: 666,
    fen: "rr3k2/pp3p2/2pq1P2/3p2Q1/2n5/2P3PB/P3P2P/1R4K1 w - - 0 1",
    solution: ["Bd7", "Qc5+", "Kh1", "Ne5", "Qg7#"]
  },
  {
    order: 667,
    fen: "rr2qnk1/p1b4p/4p3/2PpNpp1/P1p2B2/5PP1/2Q1P1BP/1R3RK1 w - - 0 1",
    solution: ["Ng4", "fxg4", "Bxc7"]
  },
  {
    order: 668,
    fen: "r3r1k1/p2R1ppp/1p4q1/8/8/5Q2/PP3PPP/3R2K1 w - - 0 1",
    solution: ["Qxa8", "Rxa8", "Rd8+", "Rxd8", "Rxd8#"]
  },
  {
    order: 669,
    fen: "k7/p4r1R/1np2q2/2Np2p1/3P4/1P1QP3/5P2/2K5 w - - 0 1",
    solution: ["Qg6", "Qxg6", "Rh8+", "Qg8", "Rxg8+", "Rf8", "Rxf8+", "Nc8", "Rxc8#"]
  },
  {
    order: 670,
    fen: "8/1p6/k1r1p1pp/b3Pp2/P3pP1P/2P3P1/1P2N1K1/3R4 w - - 0 1",
    solution: ["b4", "Bb6", "b5+", "Ka5", "bxc6"]
  },
  {
    order: 671,
    fen: "1r4k1/3r1ppp/1qp2b2/p7/2Q5/P1N2R1P/1P3PP1/4R1K1 w - - 0 1",
    solution: ["Rxf6", "gxf6", "Qg4+", "Kh8", "Qxd7"]
  },
  {
    order: 672,
    fen: "8/3bk1q1/1p2p3/2p2p1p/1p6/1P5P/5PP1/R2R2K1 w - - 0 1",
    solution: ["Rxd7+", "Kxd7", "Ra7+", "Kd6", "Rxg7"]
  },
  {
    order: 673,
    fen: "6k1/p4ppp/bpn5/2p2N2/5b2/8/PB3PPP/3R2K1 w - - 0 1",
    solution: ["Ne7+", "Kf8", "Nxc6"]
  },
  {
    order: 674,
    fen: "r2q1k1r/2pn1pp1/p2p1b1p/1p1n4/3NN3/8/PP3PPP/R1BQR1K1 w - - 0 1",
    solution: ["Nc6", "Qe8", "Qxd5"]
  },
  {
    order: 675,
    fen: "4bk1r/Q4ppp/2p1q3/8/4B3/8/P4PPP/4R1K1 w - - 0 1",
    solution: ["Qa3+", "Kg8", "Bxh7+", "Kxh7", "Rxe6"]
  },
  {
    order: 676,
    fen: "r1b1qrk1/1p4b1/p2p2Qp/P1pP1pp1/4N3/3BP1P1/1P4PP/R4RK1 w - - 0 1",
    solution: ["Nf6+", "Rxf6", "Qxe8+"]
  },
  {
    order: 677,
    fen: "3r4/p1r2bk1/5p2/2p1q1pp/8/1PR1P2P/P4QP1/2RB2K1 b - - 0 1",
    solution: ["Rxd1+", "Rxd1", "Qxc3"]
  },
  {
    order: 678,
    fen: "2k5/2p5/6r1/1p5q/8/2N1Qn2/5PRP/7K b - - 0 1",
    solution: ["Qxh2+", "Rxh2", "Rg1#"]
  },
  {
    order: 679,
    fen: "2R5/5bk1/5p2/p6p/3qPp1P/5Pp1/4Q1P1/1r1NK2R b K - 0 1",
    solution: ["Rxd1+", "Qxd1", "Qf2#"]
  },
  {
    order: 680,
    fen: "5rk1/p4bpp/Np3p2/8/1P3PQ1/5BPP/P3Pq2/5nRK b - - 0 1",
    solution: ["Qh2#"]
  },
  {
    order: 681,
    fen: "8/1p4pk/2p5/2Pb4/1P4nP/2P2N2/5pB1/5K2 b - - 0 1",
    solution: ["Bc4#"]
  },
  {
    order: 682,
    fen: "5k2/5p1p/8/1p2R3/pR1P4/P7/KP3r2/6r1 b - - 0 1",
    solution: ["Rff1", "Rc5", "Ra1#"]
  },
  {
    order: 683,
    fen: "6r1/1Rp5/2P1k2p/5p1P/PP2p3/5p2/1BR2P1K/3r4 b - - 0 1",
    solution: ["Rg2+", "Kh3", "Rh1#"]
  },
  {
    order: 684,
    fen: "1k6/r7/PK6/8/8/8/8/7R b - - 0 1",
    solution: ["Rb7+", "Ka5", "Ra7", "Kb6", "Rb7+", "axb7"]
  },
  {
    order: 685,
    fen: "r5k1/ppp3pp/2n5/3p4/8/2P2P1b/PP1P1P1P/RNB3K1 b - - 0 1",
    solution: ["Re8", "d4", "Re1#"]
  },
  {
    order: 686,
    fen: "3b2k1/1b1q1pp1/7p/3p4/P2P4/4P3/1P1Q1PKP/R1R5 b - - 0 1",
    solution: ["Qg4+", "Kh1", "Qf3+", "Kg1", "Qg4+", "Kh1", "Qf3+", "Kg1", "Qg4+"]
  },
  {
    order: 687,
    fen: "2r4k/5p1p/3R1NpP/6P1/1p2P3/1P1N1P2/P7/K7 b - - 0 1",
    solution: ["Rc1+", "Kb2", "Rc2+", "Kb1", "Rc1+"]
  },
  {
    order: 688,
    fen: "4rrk1/pp1q3p/3p2p1/2pPb3/5BP1/2PP2Q1/PP5R/5RK1 b - - 0 1",
    solution: ["Rxf4", "Rxf4", "g5"]
  },
  {
    order: 689,
    fen: "6k1/2p2p2/2P5/7q/N4Pn1/1P4Q1/P5P1/3r1RK1 b - - 0 1",
    solution: ["Qh1+", "Kxh1", "Rxf1#"]
  },
  {
    order: 690,
    fen: "3qr1k1/6p1/1b6/8/3P4/4B3/3Q2P1/5RK1 b - - 0 1",
    solution: ["Rxe3", "Qxe3", "Bxd4"]
  },
  {
    order: 691,
    fen: "r3kr2/1pp4p/1p1p4/7q/4P1n1/2PP2Q1/PP4P1/R1BB2K1 b q - 0 1",
    solution: ["Qh1+", "Kxh1", "Rf1#"]
  },
  {
    order: 692,
    fen: "r2qk3/2p2pp1/pb2b3/1p1pP3/3P3r/1BN1BPp1/PP1Q2P1/R4RK1 b q - 0 1",
    solution: ["Rh1+", "Kxh1", "Qh4+", "Kg1", "Qh2#"]
  },
  {
    order: 693,
    fen: "1Q6/r4p1k/P7/2p4p/4pn1N/5q2/5PrP/R4R1K b - - 0 1",
    solution: ["Rg1+", "Kxg1", "Nh3#"]
  },
  {
    order: 694,
    fen: "6k1/2q1bpp1/8/8/2PQ4/5N2/6P1/6K1 b - - 0 1",
    solution: ["Bc5", "Qxc5", "Qxc5+"]
  },
  {
    order: 695,
    fen: "2r4k/6p1/B7/2p5/8/3P4/5PPP/6K1 b - - 0 1",
    solution: ["Ra8", "f3", "Rxa6"]
  },
  {
    order: 696,
    fen: "6k1/2R1Q1p1/5n1p/1p1qpp2/1P1p4/3P2P1/4PP1P/r4BK1 b - - 0 1",
    solution: ["Rxf1+", "Kxf1", "Qh1#"]
  },
  {
    order: 697,
    fen: "1rbq1rk1/p3n2p/3ppp1Q/1p4pP/2pPPP2/2P3P1/PP2N1B1/2KR3R b - - 0 1",
    solution: ["Kh8", "fxg5", "Ng8", "Qxf8", "Qxf8"]
  },
  {
    order: 698,
    fen: "b3r1k1/p4ppp/1pq5/8/8/1P1P2P1/P1P2QNP/R2B2K1 b - - 0 1",
    solution: ["Re1+", "Qxe1", "Qxg2#"]
  },
  {
    order: 699,
    fen: "4k1r1/ppp4p/8/4p3/4P3/2N4n/PPP3rP/3R1R1K b - - 0 1",
    solution: ["Rg1+", "Rxg1", "Nf2#"]
  },
  {
    order: 700,
    fen: "5r1k/1pp3pp/2n5/p1PB2q1/2P3b1/P3P3/1P4QP/R1B3K1 b - - 0 1",
    solution: ["Bh3", "Qxg5", "Rf1#"]
  },
  {
    order: 701,
    fen: "8/p7/P2p4/1PpB4/2P5/kr1b4/8/K5R1 b - - 0 1",
    solution: ["Rb2", "Rg3", "Ra2#"]
  },
  {
    order: 702,
    fen: "6k1/5p2/p1q5/3pbQ2/4r1P1/1P1RB2K/P7/8 b - - 0 1",
    solution: ["Rxe3+", "Rxe3", "Qh6+", "Qh5", "Qxe3+"]
  },
  {
    order: 703,
    fen: "6r1/pppk1p1P/3bn3/8/4B2K/1Pr5/P3R3/R7 b - - 0 1",
    solution: ["Be7+", "Kh5", "Rh3#"]
  },
  {
    order: 704,
    fen: "r1b1k2r/1p3n2/p1n1p3/3pPp2/3P2pq/P1N1b1P1/1PN1BR1P/R1BQ2K1 b kq - 0 1",
    solution: ["Qxh2+", "Kf1", "Qxf2#"]
  },
  {
    order: 705,
    fen: "6k1/4ppbp/r2Pb1p1/r7/4BP2/1P6/1BP3PP/1K2R2R b - - 0 1",
    solution: ["Ra1+", "Bxa1", "Rxa1#"]
  },
  {
    order: 706,
    fen: "3r1rk1/6p1/1p5q/8/4Q3/8/PPPR4/2KR4 b - - 0 1",
    solution: ["Qxd2+", "Rxd2", "Rf1+", "Qe1", "Rxe1+", "Rd1", "Rexd1#"]
  },
  {
    order: 707,
    fen: "8/7R/6pN/2k1P3/2b2nPP/8/1r6/6K1 b - - 0 1",
    solution: ["Nh3+", "Kh1", "Bd5#"]
  },
  {
    order: 708,
    fen: "1q4k1/8/5p2/p2p1Pp1/2pPn1P1/2Pb1N1K/P7/2B1Q3 b - - 0 1",
    solution: ["Bf1+", "Qxf1", "Qg3#"]
  },
  {
    order: 709,
    fen: "1r6/p2Q2pk/6rp/5P1q/2P1P3/2RP4/P6P/5R1K b - - 0 1",
    solution: ["Qf3+", "Rxf3", "Rb1+", "Rc1", "Rxc1+", "Rf1", "Rxf1#"]
  },
  {
    order: 710,
    fen: "8/Q3bpk1/6p1/1p1qP2p/2p2P2/8/PP1r1BPP/4R1K1 b - - 0 1",
    solution: ["Rxf2", "Kxf2", "Bc5+", "Qxc5", "Qxc5+"]
  },
  {
    order: 711,
    fen: "5k2/4r1p1/1p6/b6P/3p1N2/2nP4/2PK4/2B3R1 b - - 0 1",
    solution: ["Ne2+", "Kd1", "Nxg1"]
  },
  {
    order: 712,
    fen: "4rk2/p3b3/4qpp1/R2Q3p/1Pb1B3/2P2PP1/6KP/3n2BR b - - 0 1",
    solution: ["Qh3+", "Kxh3", "Bf1+", "Kh4", "f5#"]
  },
  {
    order: 713,
    fen: "8/pp3pk1/2p4r/2P5/1P1p1q2/P2B2pP/4QbP1/5R1K b - - 0 1",
    solution: ["Rxh3+", "gxh3", "g2+", "Kxg2", "Qg3+", "Kh1", "Qxh3#"]
  },
  {
    order: 714,
    fen: "1kr5/ppp3p1/1q2p3/1B1pP3/3P2P1/1P5r/K1P1Q2P/1Rb4R b - - 0 1",
    solution: ["Qa5+", "Ba4", "Qxa4+", "bxa4", "Ra3#"]
  },
  {
    order: 715,
    fen: "4r1k1/pp3p1p/2p5/5p2/5P2/2PB2KP/P2B2P1/1Q4q1 b - - 0 1",
    solution: ["Qxb1", "Bxb1", "Re2", "Bc1", "Re1"]
  },
  {
    order: 716,
    fen: "r1bqk2r/pppp1ppp/5n2/2b1n3/4P3/1BP3Q1/PP3PPP/RNB1K1NR b KQkq - 0 1",
    solution: ["Bxf2+", "Kxf2", "Nxe4+", "Ke1", "Nxg3"]
  },
  {
    order: 717,
    fen: "2r3k1/5ppp/4p3/5q2/8/Pp1Q4/1P4PP/1K1R4 b - - 0 1",
    solution: ["Rd8", "Qxf5", "Rxd1#"]
  },
  {
    order: 718,
    fen: "6r1/1ppb1k2/p2p1p2/3P4/2P2P1N/4R1nP/PP1K2B1/8 b - - 0 1",
    solution: ["Nf5", "Nxf5", "Rxg2+", "Re2", "Rxe2+", "Kxe2", "Bxf5"]
  },
  {
    order: 719,
    fen: "r1b2rk1/pp2q1pp/3p4/1Pp1p3/2Pnp3/P1Q1P1P1/1B1P1P1P/2K2RNR b - - 0 1",
    solution: ["Bh3", "Re1", "Bg2", "Ne2", "Bxh1"]
  },
  {
    order: 720,
    fen: "7k/1p4p1/7p/3P1n2/4Q3/2P2P1b/PP3q1P/6RK b - - 0 1",
    solution: ["Bg2+", "Rxg2", "Qf1+", "Rg1", "Ng3+", "hxg3", "Qh3#"]
  },
  {
    order: 721,
    fen: "7Q/2p1k1pp/1b1p1n2/pP2p2q/P1B1Pn2/B1P2bP1/R2N1P1P/4R1K1 b - - 0 1",
    solution: ["Qh3", "Bf1", "Qxh2+", "Kxh2", "Ng4+", "Kg1", "Bxf2#"]
  },
  {
    order: 722,
    fen: "7R/P4k2/2K2p2/5p1p/5P1P/8/8/r7 b - - 0 1",
    solution: ["Rxa7", "Rh7+", "Ke6", "Rxa7"]
  },
  {
    order: 723,
    fen: "3r3k/5Bpp/Q4R2/4p3/4q3/8/6PP/7K b - - 0 1",
    solution: ["Qc6", "Qxc6", "Rd1+", "Rf1", "Rxf1#"]
  },
  {
    order: 724,
    fen: "4r1k1/1pQ3pp/2p2p2/P3n3/6b1/6P1/4PP1P/1R1NqBK1 b - - 0 1",
    solution: ["Nf3+", "exf3", "Qxf1+", "Kxf1", "Bh3+", "Kg1", "Re1#"]
  },
  {
    order: 725,
    fen: "8/p2R1pkp/1p1B2pb/3B4/8/5KP1/PP3P1P/4rb2 b - - 0 1",
    solution: ["Be2+", "Kg2", "Bf1+", "Kf3", "Be2+"]
  },
  {
    order: 726,
    fen: "r7/1kp4b/5n1p/1p2p3/6p1/BP3rR1/KPq1N2P/3Q3R b - - 0 1",
    solution: ["Rxa3+", "Kxa3", "Qc5+", "Ka2", "Qa7#"]
  },
  {
    order: 727,
    fen: "2k2r2/2p5/1pq5/p1p1n3/P1P4B/1R4Pp/2Q1R3/6K1 b - - 0 1",
    solution: ["Rf1+", "Kxf1", "Qh1+", "Kf2", "Ng4#"]
  },
  {
    order: 728,
    fen: "3rk3/pp3p1p/6n1/2Qnp3/8/P1Pq4/4NPPP/R1B1K2R b KQ - 0 1",
    solution: ["Qd1+", "Kxd1", "Ne3+", "Ke1", "Rd1#"]
  },
  {
    order: 729,
    fen: "4r1k1/5pp1/8/1p1R4/8/1PP2nNP/R4P2/5K2 b - - 0 1",
    solution: ["Re1+", "Kg2", "Nh4+", "Kh2", "Nf3+", "Kg2", "Nh4+"]
  },
  {
    order: 730,
    fen: "1k1r4/1p4pp/4B3/8/1nQN4/1qn5/1P4PP/K4R2 b - - 0 1",
    solution: ["Qa4+", "Qa2", "Ncxa2"]
  },
  {
    order: 731,
    fen: "1r4r1/p2kb2p/bq2p3/3p1p2/5P2/2BB3Q/PP4PP/3RKR2 b - - 0 1",
    solution: ["Rg3", "Qxg3", "Bh4", "Qxh4", "Qe3+", "Be2", "Qxe2#"]
  },
  {
    order: 732,
    fen: "r3r1k1/1p1b1pp1/1p5p/3Pq3/1R6/P2Q1B2/1P4PP/R6K b - - 0 1",
    solution: ["Rxa3", "bxa3", "Qxa1+", "Rb1", "Re1+", "Qf1", "Rxf1+", "Rxf1", "Qxf1#"]
  },
  {
    order: 733,
    fen: "1r4k1/6P1/7K/6P1/8/4R3/8/8 b - - 0 1",
    solution: ["Rb6+", "g6", "Rxg6+", "Kxg6"]
  },
  {
    order: 734,
    fen: "4nrk1/p4q2/1p1p4/1P1P4/2N2rP1/3Q4/1P4P1/R3R1K1 b - - 0 1",
    solution: ["Rxc4", "Qxc4", "Qf2+", "Kh2", "Qh4+", "Kg1", "Qf2+"]
  },
  {
    order: 735,
    fen: "8/6kp/1p4p1/2p2p2/7K/PPRnr3/3R2PP/8 b - - 0 1",
    solution: ["Kh6", "Rcxd3", "g5#"]
  },
  {
    order: 736,
    fen: "5r1k/1b4p1/p6p/4Pp1q/2pNnP2/7N/PPQ3PP/5R1K b - - 0 1",
    solution: ["Qxh3", "gxh3", "Ng5+", "Kg1", "Nxh3#"]
  },
  {
    order: 737,
    fen: "3r1rk1/pp2qp1p/3N2p1/2pQP3/b1P2P2/8/PP4PP/2K2B1R b - - 0 1",
    solution: ["Rxd6", "Qxd6", "Rd8", "Qxd8+", "Qxd8"]
  },
  {
    order: 738,
    fen: "R6R/1p6/8/pk6/4q3/6P1/P4Q1K/r2b4 b - - 0 1",
    solution: ["Qh1+", "Kxh1", "Bf3+", "Kh2", "Rh1#"]
  },
  {
    order: 739,
    fen: "7k/1pp4p/3p2q1/p1nPp3/2P1Pr2/8/PPB5/1K4RQ b - - 0 1",
    solution: ["Rh4", "Qg2", "Qxg2", "Rxg2", "Rh1+", "Bd1", "Rxd1+"]
  },
  {
    order: 740,
    fen: "8/8/5b2/8/1p6/2k5/2P5/KB6 b - - 0 1",
    solution: ["b3", "cxb3", "Kxb3#"]
  },
  {
    order: 741,
    fen: "rnb2rk1/ppp3pp/3p4/3Pp1q1/1PP2pnP/P1N5/1B2P1P1/R2Q1BKR b - - 0 1",
    solution: ["f3", "gxf3", "Qe3+", "Kg2", "Qf2+", "Kh3", "Ne3#"]
  },
  {
    order: 742,
    fen: "2k2b1r/ppp3pp/2n2q2/3B1b2/5P2/2P1B3/PP1N3P/2KR3R b - - 0 1",
    solution: ["Qxc3+", "bxc3", "Ba3#"]
  },
  {
    order: 743,
    fen: "r3r1k1/1p3ppp/2p2b2/p7/8/Q1BP2Pq/PPP4P/4RR1K b - - 0 1",
    solution: ["Re2", "Rxe2", "Qxf1#"]
  },
  {
    order: 744,
    fen: "2r2rk1/pp4pp/1q2p1b1/3p2b1/3P4/1P1B1P2/1B1PQ1P1/1K1R3R b - - 0 1",
    solution: ["Qb5", "Bxg6", "Qxe2"]
  },
  {
    order: 745,
    fen: "8/R7/R3B3/4r1pP/p4k2/8/6PK/r7 b - - 0 1",
    solution: ["Rh1+", "Kxh1", "Kg3", "Rxa4", "Re1#"]
  },
  {
    order: 746,
    fen: "1k6/1p1r4/8/8/q4p1Q/2N1bP2/2n3P1/1RB2K2 b - - 0 1",
    solution: ["Qc4+", "Ne2", "Rd1+", "Qe1", "Rxe1#"]
  },
  {
    order: 747,
    fen: "8/kr4r1/1p6/2b5/4Qn2/6Rq/5N1P/5RKN b - - 0 1",
    solution: ["Qg2+", "Qxg2", "Ne2#"]
  },
  {
    order: 748,
    fen: "4r1k1/p4ppp/1p6/1q1N4/3b1P2/3R1Q2/P5PP/1r1R1K2 b - - 0 1",
    solution: ["Re3", "Qxe3", "Rxd1+", "Ke2", "Bxe3"]
  },
  {
    order: 749,
    fen: "8/4P1R1/8/4r2p/5K1k/8/6P1/8 b - - 0 1",
    solution: ["Rxe7", "Rxe7"]
  },
  {
    order: 750,
    fen: "5rk1/1p4pp/2pb4/4P3/1P1P2nq/3Q4/6BP/1R3NK1 b - - 0 1",
    solution: ["Rxf1+", "Rxf1", "Qxh2#"]
  },
  {
    order: 751,
    fen: "r6k/8/7p/2nN1b2/8/8/1PP3B1/1K4R1 b - - 0 1",
    solution: ["Nb3", "Be4", "Ra1#"]
  },
  {
    order: 752,
    fen: "r3r1k1/pp3pbp/3p2p1/2pP3b/2P1P3/2N4q/PP2BP1P/R3QR1K b - - 0 1",
    solution: ["Bf3+", "Bxf3", "Be5", "Bg2", "Qxh2#"]
  },
  {
    order: 753,
    fen: "6k1/1q3p1p/b3p1p1/3p4/P1r2P2/2N5/1P1R1QPP/6K1 b - - 0 1",
    solution: ["Rxc3", "bxc3", "Qb1+", "Rd1", "Qxd1+", "Qe1", "Qxe1#"]
  },
  {
    order: 754,
    fen: "8/2k2p2/1p1p4/p1pPpP2/2P1Pr2/PP2Q2R/1RK3P1/q2r4 b - - 0 1",
    solution: ["Rf2+", "Qd2", "Qc1+", "Kd3", "Rdxd2+", "Rxd2", "Qxd2#"]
  },
  {
    order: 755,
    fen: "r2rb1k1/pp3pp1/4p1p1/1P2B3/2PnR2q/2Q3NP/P4PP1/R5K1 b - - 0 1",
    solution: ["Qxe4", "Nxe4", "Ne2+", "Kh1", "Nxc3"]
  },
  {
    order: 756,
    fen: "5k2/p4P1p/7r/4p3/2B1b1n1/1PP3Pq/P3Q2P/5RK1 b - - 0 1",
    solution: ["Qxg3+", "hxg3", "Rh1#"]
  },
  {
    order: 757,
    fen: "8/4qpk1/1Q2p1p1/3pP1N1/3P1Pn1/P7/4b2r/R5K1 b - - 0 1",
    solution: ["Qxg5", "fxg5", "Bf3", "a4", "Rh1#"]
  },
  {
    order: 758,
    fen: "7k/q4pp1/5p2/2n3Pb/3Qn3/3p4/BP3B2/2K4R b - - 0 1",
    solution: ["Nb3+", "Bxb3", "Qa1#"]
  },
  {
    order: 759,
    fen: "1Q6/8/4q2p/3p3k/3P2R1/4PKPP/r4P2/8 b - - 0 1",
    solution: ["Rxf2+", "Kxf2", "Qxe3+", "Kg2", "Qf2+", "Kxf2"]
  },
  {
    order: 760,
    fen: "5rk1/1B2bp1p/p2p1p2/q4R2/8/2r5/P1PQ2PP/1R5K b - - 0 1",
    solution: ["Rb3", "Rg1", "Qxd2"]
  },
  {
    order: 761,
    fen: "r4r1k/pQp3pp/2n5/2p2b2/8/2P5/PP1NBPqP/2KR3R b - - 0 1",
    solution: ["Nb4", "cxb4", "Qxb7"]
  },
  {
    order: 762,
    fen: "r2qk2r/1ppnbpp1/3p2bp/p1nP4/2PQ1BPP/2N2P2/PP3N2/2KR1B1R b kq - 0 1",
    solution: ["Nb3+", "axb3", "Nc5", "Qxg7", "Nxb3#"]
  },
  {
    order: 763,
    fen: "6nr/pQ4pp/2Bk4/2b5/3r1pbq/2N5/PPP3PP/R1B2K1R b - - 0 1",
    solution: ["Qf2+", "Kxf2", "Rd1+", "Be3", "Bxe3#"]
  },
  {
    order: 764,
    fen: "r3k2r/pp2n1b1/3p2p1/q1pPpbPp/1nP4P/P1N1Q3/1P1B1P2/2KR1BNR b kq - 0 1",
    solution: ["Qa4", "Nxa4", "Na2#"]
  },
  {
    order: 765,
    fen: "5R2/4P1k1/6pp/p7/6p1/8/5PKP/3q4 b - - 0 1",
    solution: ["Qf3+", "Rxf3", "gxf3+", "Kxf3", "Kf7"]
  },
  {
    order: 766,
    fen: "3rr1k1/qpb2p2/2p1pQp1/p7/P1BnP3/6P1/1P2NP1P/2RR2K1 b - - 0 1",
    solution: ["Be5", "Qxe5", "Nf3+", "Kf1", "Nxe5"]
  },
  {
    order: 767,
    fen: "8/p1k2p2/1p1R4/3PB1P1/6K1/7r/5p2/8 b - - 0 1",
    solution: ["f5+", "gxf6", "f1=Q"]
  },
  {
    order: 768,
    fen: "1r3r1k/p1p4p/3q2pb/3Ppb2/2Q2n2/P1N1BN2/1P4PP/2KR1R2 b - - 0 1",
    solution: ["Qb6", "Bxb6", "Ne2#"]
  },
  {
    order: 769,
    fen: "2r5/pp3pkp/6p1/8/4P1P1/5b1P/PqPQ1P2/2R1K1R1 b - - 0 1",
    solution: ["Rd8", "Qe3", "Qxc2"]
  },
  {
    order: 770,
    fen: "2r3k1/5p1p/p3q1p1/2n3P1/1p1QP2P/1P4N1/PK6/2R5 b - - 0 1",
    solution: ["Qe5", "Rd1", "Qxg3"]
  },
  {
    order: 771,
    fen: "2r3k1/p4p2/1p1b2p1/3Pq3/3N4/7P/PP4Q1/3R3K b - - 0 1",
    solution: ["Qxd4", "Rxd4", "Rc1+", "Qg1", "Rxg1+", "Kxg1", "Bc5"]
  },
  {
    order: 772,
    fen: "3r2k1/1p4pp/2p5/pnP2b2/2K2N1P/P4P2/5BP1/7R b - - 0 1",
    solution: ["Rd3", "Nxd3", "Be6#"]
  },
  {
    order: 773,
    fen: "6R1/8/4p3/4P3/4np2/3r1k2/8/4K1B1 b - - 0 1",
    solution: ["Nc3", "Rc8", "Rd1#"]
  },
  {
    order: 774,
    fen: "r3k2r/p3q3/1pp1p3/2b1p3/PPQ1Pp2/2N2P2/2P2P2/3RR1K1 b kq - 0 1",
    solution: ["Rh1+", "Kg2", "Qg5+", "Kxh1", "Qh4+", "Kg1", "Qxf2+", "Kh1", "Kf7", "Rf1", "Rh8#"]
  },
  {
    order: 775,
    fen: "6k1/5r1p/1pqpQ1p1/p7/2P2r2/1P1R4/P5PP/3R3K b - - 0 1",
    solution: ["Qe4", "Qxf7+", "Rxf7"]
  },
  {
    order: 776,
    fen: "3r2k1/Q4p2/Bp2p1pp/3r4/1P1n3q/P7/1P3PPP/2R1R1K1 b - - 0 1",
    solution: ["Nf3+", "gxf3", "Rg5+", "Kf1", "Qh3+", "Ke2", "Re5#"]
  },
  {
    order: 777,
    fen: "5bk1/1R1R3p/6p1/8/8/6P1/rp3PKP/8 b - - 0 1",
    solution: ["Ra7", "Rxa7", "b1=Q"]
  },
  {
    order: 778,
    fen: "2r4r/3Q1bk1/pq4p1/5R2/2p5/2P5/PP5P/6RK b - - 0 1",
    solution: ["Qxg1+", "Kxg1", "gxf5"]
  },
  {
    order: 779,
    fen: "2Q5/k1p3pp/pb2p3/1b6/1N1n4/P2q2BP/1P3PP1/6KR b - - 0 1",
    solution: ["Qxg3", "fxg3", "Nf3#"]
  },
  {
    order: 780,
    fen: "rnb1k2r/pp3ppp/4p3/3p4/NP3q2/2PQB1bP/P3PPP1/2R1KB1R b Kkq - 0 1",
    solution: ["Bxf2+", "Kd2", "Bxe3+", "Qxe3", "Qxe3+"]
  },
  {
    order: 781,
    fen: "5k2/3p1p1p/pq1P1pr1/7N/2Q5/2Pn1P2/Pr4PP/R4R1K b - - 0 1",
    solution: ["Qg1+", "Rxg1", "Nf2#"]
  },
  {
    order: 782,
    fen: "r2q3k/1p3rb1/6p1/p1Np3P/3p3P/PP1P1N1n/4PP2/2RQRK2 b - - 0 1",
    solution: ["Qxh4", "Nxh4", "Rxf2#"]
  },
  {
    order: 783,
    fen: "r1b2rk1/pp4pp/2p1pq2/2bp1p2/2P1n3/1P3PP1/PBQ1P1BP/RN3R1K b - - 0 1",
    solution: ["Nxg3+", "hxg3", "Qh6+", "Bh3", "Qxh3#"]
  },
  {
    order: 784,
    fen: "8/5p1k/5P2/R6p/3PbP1P/3n3P/3Q3K/1r6 b - - 0 1",
    solution: ["Rh1+", "Kg3", "Rg1+", "Kh2", "Rh1+"]
  },
  {
    order: 785,
    fen: "2r3k1/1b3ppp/p3p3/Bp1n4/4q3/P2QP1P1/1P2BP1P/5RK1 b - - 0 1",
    solution: ["Qg2+", "Kxg2", "Nf4+", "Kg1", "Nh3#"]
  },
  {
    order: 786,
    fen: "8/5pk1/1p2p1q1/3rn3/PP5R/8/1Q3PP1/5BK1 b - - 0 1",
    solution: ["Qf6", "Qe2", "Qxh4"]
  },
  {
    order: 787,
    fen: "r1b2rk1/pp2qppp/4nn2/1Bp1N3/4P3/2P4P/P1P2PP1/R1BQR1K1 b - - 0 1",
    solution: ["Nc7", "Bf1", "Qxe5"]
  },
  {
    order: 788,
    fen: "rnbqkb1r/pppp1ppp/8/4P3/6n1/7P/PPPNPPP1/R1BQKBNR b KQkq - 0 1",
    solution: ["Ne3", "Ngf3", "Nxd1"]
  },
  {
    order: 789,
    fen: "5r1k/ppp3pp/2b1p3/8/P1PPP3/2BQ4/5qPP/4R2K b - - 0 1",
    solution: ["Bxe4", "Qxe4", "Qf1+", "Rxf1", "Rxf1#"]
  },
  {
    order: 790,
    fen: "5rk1/1pp3p1/p2p2r1/4p3/1P2PP2/2P1QP1q/1P1N3R/5R1K b - - 0 1",
    solution: ["Qxh2+", "Kxh2", "Kf7", "Rg1", "Rh8#"]
  },
  {
    order: 791,
    fen: "r7/1kp3p1/3p1b2/pP1P3Q/8/6P1/1PP2P1p/2K5 b - - 0 1",
    solution: ["Rh8", "Qxh8", "Bg5+", "f4", "Bh6", "Qxh6", "gxh6"]
  },
  {
    order: 792,
    fen: "2kr1b1r/p2b1ppp/2B1p3/2p5/Q3P3/2q5/P3KPPP/1RB4R b - - 0 1",
    solution: ["Qd3+", "Kxd3", "Bxc6+", "Ke2", "Bxa4"]
  },
  {
    order: 793,
    fen: "3r1rk1/p4pp1/1p2q2p/4P2Q/4RB2/Pn5P/1P3PP1/3R2K1 b - - 0 1",
    solution: ["Qg6", "Qf3", "Rxd1+", "Qxd1", "Qxe4"]
  },
  {
    order: 794,
    fen: "r1b2r1k/pp4pp/3p4/3B4/8/1QN3Pn/PP3q1P/R3R2K b - - 0 1",
    solution: ["Qg1+", "Rxg1", "Nf2+", "Kg2", "Bh3#"]
  },
  {
    order: 795,
    fen: "5rkn/pp2bq2/4p1p1/3b1n2/3p1BK1/P2B2PQ/1P3P1R/R7 b - - 0 1",
    solution: ["Ne3+", "fxe3", "Qf5+", "Bxf5", "exf5#"]
  },
  {
    order: 796,
    fen: "1kr5/1p6/1p4R1/3pN3/3P4/nPp1P3/Pr6/K1R5 b - - 0 1",
    solution: ["Rb1+", "Rxb1", "Nc2#"]
  },
  {
    order: 797,
    fen: "r5k1/pbb2ppp/1p2r3/6q1/3Nn3/P2BP2P/1B2RPP1/4QR1K b - - 0 1",
    solution: ["Qxg2+", "Kxg2", "Rg6+", "Kf3", "Nd2#"]
  },
  {
    order: 798,
    fen: "1kr5/1p1r1pR1/p1bbp2p/2q5/3pN2P/5B2/PPP3P1/2KRQ3 b - - 0 1",
    solution: ["Qxc2+", "Kxc2", "Bxe4+", "Kb3", "Bc2#"]
  },
  {
    order: 799,
    fen: "8/7R/2r5/8/P3n3/8/3nk1PP/R5K1 b - - 0 1",
    solution: ["Nf3+", "gxf3", "Rg6+", "Kh1", "Nf2#"]
  },
  {
    order: 800,
    fen: "6k1/2R1bppp/p7/1p3P2/3Br1P1/7P/PP6/6K1 b - - 0 1",
    solution: ["Bd8", "Rc8", "Rxd4"]
  },
  {
    order: 801,
    fen: "8/7k/b2N1r2/p3Rpp1/7p/2P4K/1P1R2PP/5r2 b - - 0 1",
    solution: ["Rxd6", "Rxd6", "Rf3+", "gxf3", "Bf1#"]
  },
  {
    order: 802,
    fen: "8/8/pQ2pppk/2p5/5P2/KPn5/2P2P2/1r6 b - - 0 1",
    solution: ["Na4", "Qxe6", "Ra1#"]
  },
  {
    order: 803,
    fen: "3b3k/3p2pp/8/pP6/P7/R2r4/2K2R1P/6r1 b - - 0 1",
    solution: ["Rg2", "Rxg2", "Rxa3"]
  },
  {
    order: 804,
    fen: "5r1k/p5pp/1pQ1R3/4P3/8/4B3/q4rPP/4R1K1 b - - 0 1",
    solution: ["Qe2", "Rxe2", "Rf1#"]
  },
  {
    order: 805,
    fen: "4r1k1/p2n2b1/1np3p1/8/1B1P4/5P2/qPP1N3/2KRQ2R b - - 0 1",
    solution: ["Nc4", "Nc3", "Qxb2#"]
  },
  {
    order: 806,
    fen: "8/3k3P/3P4/2p5/1p2p3/8/2P2r2/qQKR4 b - - 0 1",
    solution: ["Rxc2+", "Kxc2", "Qc3#"]
  },
  {
    order: 807,
    fen: "rnr3k1/p3b1pp/qp1pp3/5p2/3P1Pn1/4P1Q1/PP1N2PP/R1BKN1R1 b - - 0 1",
    solution: ["Bh4", "Qf3", "Bf2", "Rf1", "Nxe3+", "Qxe3", "Bxe3"]
  },
  {
    order: 808,
    fen: "4r1k1/pp1q1ppp/2pb4/3p4/3P1P2/3Q1P2/PP1Br2P/4RR1K b - - 0 1",
    solution: ["Qh3", "Qxe2", "Rxe2", "Rd1", "Qxh2#"]
  },
  {
    order: 809,
    fen: "5rk1/p1b3q1/1p3p2/3p1Q2/5B1p/1P2P2P/P4nPK/2R3N1 b - - 0 1",
    solution: ["Qg3+", "Bxg3", "Bxg3#"]
  },
  {
    order: 810,
    fen: "6rk/ppR4p/3p4/3P1n2/PPN1Pp2/7P/3R3K/6r1 b - - 0 1",
    solution: ["Nh4", "Rf2", "Nf3+", "Rxf3", "R8g2#"]
  },
  {
    order: 811,
    fen: "2k1r2r/ppp3p1/5p2/5n2/7p/1QP3Pq/PP3PBP/3R2RK b - - 0 1",
    solution: ["Qxh2+", "Kxh2", "hxg3#"]
  },
  {
    order: 812,
    fen: "6k1/p5p1/1p3q1p/2p1r3/8/1PQ4P/P1P2PP1/4R1K1 b - - 0 1",
    solution: ["Re2", "Qxf6", "Rxe1+", "Kh2", "gxf6"]
  },
  {
    order: 813,
    fen: "5k2/6pp/p1qN4/1p1p4/3P4/2PKP2Q/PP3r2/3R4 b - - 0 1",
    solution: ["Qc4+", "Nxc4", "bxc4#"]
  },
  {
    order: 814,
    fen: "6N1/2p5/p1Pk1p2/2r1n1p1/5nPP/1P2RR2/P4P2/6K1 b - - 0 1",
    solution: ["Rc1+", "Kh2", "Nxg4+", "Kg3", "Rg1#"]
  },
  {
    order: 815,
    fen: "r3r1k1/pppq1ppp/8/8/1Q4n1/7P/PPP2PP1/RNB1R1K1 b - - 0 1",
    solution: ["Qd6", "hxg4", "Qxb4"]
  },
  {
    order: 816,
    fen: "6k1/7p/6p1/pq3p2/1p2bPr1/1P2Q3/P2R2PP/7K b - - 0 1",
    solution: ["Rxg2", "Rxg2", "Qf1+", "Qg1", "Bxg2#"]
  },
  {
    order: 817,
    fen: "8/pQRq2pk/4p2p/3r1p2/3P4/P3P3/1P3PPP/6K1 b - - 0 1",
    solution: ["Rc5", "Rxc5", "Qxb7"]
  },
  {
    order: 818,
    fen: "r3k2r/1p3ppp/pb1p4/4PQ2/2B2Pn1/N3q3/PP4PP/R4R1K b kq - 0 1",
    solution: ["Qg1+", "Rxg1", "Nf2#"]
  },
  {
    order: 819,
    fen: "1Q6/5p1k/6Bp/1p1p4/pP1P2n1/P1P3Pq/4bPNP/6K1 b - - 0 1",
    solution: ["Kg7", "Qe5+", "Nxe5"]
  },
  {
    order: 820,
    fen: "3b2k1/5pp1/p2Bb3/1p1p3p/1Pq5/P1N1P1P1/1Q3PKP/8 b - - 0 1",
    solution: ["Bh3+", "Kf3", "Qg4#"]
  },
  {
    order: 821,
    fen: "4r1k1/8/3R1Qpp/2p5/2P1p1q1/P3P3/1P2PK2/8 b - - 0 1",
    solution: ["Rf8", "Rd8", "Qh4+", "Kg1", "Qxf6"]
  },
  {
    order: 822,
    fen: "6rk/2R4p/2N1pq2/1Pnp1p2/4nP2/4P3/7P/Q4R1K b - - 0 1",
    solution: ["Qxa1", "Rxa1", "Nf2#"]
  },
  {
    order: 823,
    fen: "8/pQp2ppk/3q3p/5b2/8/P3P3/1P3PPP/n1KN1B1R b - - 0 1",
    solution: ["Qc6+", "Kd2", "Qxb7"]
  },
  {
    order: 824,
    fen: "7k/7p/3p3P/qB1Pp3/p1PbPp1Q/Pn1r4/1BK3R1/8 b - - 0 1",
    solution: ["Qd2+", "Rxd2", "Rxd2+", "Kb1", "Rxb2#"]
  },
  {
    order: 825,
    fen: "r4rk1/1p3ppp/1ppp4/4p3/3PPn2/1BN2Pnq/PPPQ1R1N/3R2K1 b - - 0 1",
    solution: ["Qg2+", "Rxg2", "Nh3#"]
  },
  {
    order: 826,
    fen: "4r1k1/bQp1qpp1/p2p3p/8/5Bn1/2P4P/PP3PP1/R2RrBK1 b - - 0 1",
    solution: ["Qe2", "Rxe1", "Qxf2+", "Kh1", "Qg1#"]
  },
  {
    order: 827,
    fen: "3rkb2/ppp1q2p/6N1/7Q/4n3/8/PPn2PPP/RNBB1K1R b - - 0 1",
    solution: ["Ng3+", "fxg3", "Qe1#"]
  },
  {
    order: 828,
    fen: "5q2/2NQR1bk/7p/2p3p1/P7/4B1PP/1P5K/5r2 b - - 0 1",
    solution: ["Rf2+", "Bxf2", "Qxf2+", "Kh1", "Qf1+", "Kh2", "Qf2+"]
  },
  {
    order: 829,
    fen: "7k/7p/8/p1p1P3/2P5/1P2pq2/P5RQ/7K b - - 0 1",
    solution: ["Qd1+", "Rg1", "Qf3+", "Rg2", "Qd1+", "Qg1", "Qh5+", "Qh2", "Qd1+", "Rg1", "Qf3+", "Qg2", "Qh5+", "Qh2", "Qf3+", "Rg2", "Qd1+", "Qg1", "Qh5+", "Rh2", "Qf3+", "Qg2", "Qd1+", "Qg1", "Qf3+"]
  },
  {
    order: 830,
    fen: "1Q6/5kpp/p1p2pq1/8/1P6/P3P2P/8/3KR3 b - - 0 1",
    solution: ["Qd3+", "Kc1", "Qc3+", "Kd1", "Qd3+"]
  },
  {
    order: 831,
    fen: "2rr2k1/1p5p/5p2/8/1b3Pb1/1PN3PP/pP6/N1K2R1R b - - 0 1",
    solution: ["Rxc3+", "bxc3", "Ba3+", "Kc2", "Bf5#"]
  },
  {
    order: 832,
    fen: "8/2p2pk1/4rbp1/8/2N3QP/2P1P1P1/1P2RK2/3q4 b - - 0 1",
    solution: ["Bxc3", "bxc3", "Rf6+", "Kg2", "Qf1+", "Kh2", "Rf2+", "Rxf2", "Qxf2+", "Kh1", "Qf1+", "Kh2", "Qf2+", "Kh3", "Qf1+", "Kh2", "Qf2+"]
  },
  {
    order: 833,
    fen: "4r3/p3rk2/1pRQ1b1p/5R1p/8/5PP1/Pq3BK1/8 b - - 0 1",
    solution: ["Qxf2+", "Kxf2", "Re2+", "Kg1", "Re1+", "Kg2", "R8e2+", "Kh3", "Rh1#"]
  },
  {
    order: 834,
    fen: "8/P2Q1p2/6p1/7k/5np1/5r2/1PP5/6K1 b - - 0 1",
    solution: ["Ne2+", "Kh2", "g3+", "Kh1", "Rf1+", "Kg2", "Rf2+", "Kh1"]
  },
  {
    order: 835,
    fen: "8/p1p1kpbp/6p1/2Kp4/3P4/P3P3/1r3PPP/RN6 b - - 0 1",
    solution: ["Ke6", "Nc3", "Bf8+", "Kc6", "Rb6+", "Kxc7", "Bd6+", "Kc8", "Rb8#"]
  },
  {
    order: 836,
    fen: "8/5ppk/2Q1p3/4Pn2/2p2q1p/2P5/P5PP/6BK b - - 0 1",
    solution: ["Ng3+", "hxg3", "hxg3", "Qf3", "Qh4+", "Bh2", "Qxh2#"]
  },
  {
    order: 837,
    fen: "8/p5rk/2Q2n1b/4p1q1/4Pp2/5B1R/PR3BPK/3r4 b - - 0 1",
    solution: ["Qxg2+", "Bxg2", "Ng4#"]
  },
  {
    order: 838,
    fen: "6kr/p1q2pr1/B1Q5/8/3P4/4p1P1/P1R4P/7K b - - 0 1",
    solution: ["Rxh2+", "Kg1", "Qxg3+", "Rg2", "Qxg2+", "Qxg2", "Rgxg2+"]
  },
  {
    order: 839,
    fen: "3Q4/5p1k/1p4pp/pB5q/Pr6/6P1/6KP/3R4 b - - 0 1",
    solution: ["Rb2+", "Rd2", "Qd1", "Rxb2", "Qxd8"]
  },
  {
    order: 840,
    fen: "1r3nk1/5pb1/p2p1Pp1/3P2P1/2p1q1B1/2Pn3Q/6RR/6BK b - - 0 1",
    solution: ["Nf2+", "Bxf2", "Rb1+", "Bg1", "Rxg1+", "Kxg1", "Qe1#"]
  },
  {
    order: 841,
    fen: "8/5pk1/3p4/P2P2pp/2Q5/2P2qPK/7P/8 b - - 0 1",
    solution: ["g4+", "Kh4", "Kg6", "a6", "Qf6#"]
  },
  {
    order: 842,
    fen: "8/6k1/q5p1/2pK3p/3bB3/5P2/P1Q5/8 b - - 0 1",
    solution: ["Kf6", "Bxg6", "Qe6#"]
  },
  {
    order: 843,
    fen: "7r/6k1/p5r1/R6R/5P2/6PK/8/8 b - - 0 1",
    solution: ["Rxh5+", "Rxh5", "Rh6", "Rxh6", "Kxh6", "Kg4", "a5", "Kf3", "a4", "Ke3", "a3", "Kd3", "a2", "Kc2", "a1=Q"]
  },
  {
    order: 844,
    fen: "5kr1/8/5pbK/1N2p3/8/2P4R/8/8 b - - 0 1",
    solution: ["Bf5", "Rf3", "Rh8#"]
  },
  {
    order: 845,
    fen: "3r2k1/4R2p/6p1/2Q5/2P1P3/1R3q2/P2r3P/5BK1 b - - 0 1",
    solution: ["Rg2+", "Bxg2", "Rd1+", "Bf1", "Rxf1#"]
  },
  {
    order: 846,
    fen: "4r3/1p4pk/2b2pq1/7p/3B1P2/7P/4RQP1/7K b - - 0 1",
    solution: ["Qxg2+", "Qxg2", "Rxe2", "Qxc6", "bxc6"]
  },
  {
    order: 847,
    fen: "5q2/6pk/2p3r1/2Pp2r1/4p2p/2Q1P2P/3R1PPK/6R1 b - - 0 1",
    solution: ["Qf3", "g3", "hxg3+", "fxg3", "Rxg3", "Rxg3", "Qxg3+", "Kh1", "Qg1#"]
  },
  {
    order: 848,
    fen: "k7/p7/3b4/q2b4/8/5B2/2Q3PP/7K w - - 0 1",
    solution: ["Qc8+", "Bb8", "Qc6+", "Bxc6", "Bxc6#"]
  },
  {
    order: 849,
    fen: "r1q2r1k/p4b2/1p2pP2/3p3p/1P1B1P2/2PB4/P3Q2P/6RK w - - 0 1",
    solution: ["Qxh5+", "Bxh5", "f7+", "e5", "Bxe5#"]
  },
  {
    order: 850,
    fen: "1R6/p7/kpp1p3/6n1/PPPP1Brp/8/2K5/8 w - - 0 1",
    solution: ["Bd2", "Ne4", "b5+", "cxb5", "axb5#"]
  },
  {
    order: 851,
    fen: "4R3/1p1r1ppk/2q3b1/8/7P/2B1Q3/1P3P2/6K1 w - - 0 1",
    solution: ["Rh8+", "Kxh8", "Qh6+", "Kg8", "Qxg7#"]
  },
  {
    order: 852,
    fen: "Q7/2rk1pp1/3b4/5q2/8/8/4BP2/4RK2 w - - 0 1",
    solution: ["Qe8+", "Kxe8", "Bb5+", "Kd8", "Re8#"]
  },
  {
    order: 853,
    fen: "q4r2/p4ppk/2R1n3/5N2/8/2Q3P1/1P3P2/5K2 w - - 0 1",
    solution: ["Qxg7+", "Nxg7", "Rh6+", "Kg8", "Ne7#"]
  },
  {
    order: 854,
    fen: "5N2/r3Bpkp/6p1/3q4/5Q1K/8/8/8 w - - 0 1",
    solution: ["Ne6+", "Qxe6", "Qh6+", "Kg8", "Qf8#"]
  },
  {
    order: 855,
    fen: "5nk1/R4N1p/5P1Q/8/2p1q3/8/KP6/6r1 w - - 0 1",
    solution: ["Qg7+", "Rxg7", "Nh6+", "Kh8", "fxg7#"]
  },
  {
    order: 856,
    fen: "2qk3r/2p1nQp1/3p4/3BP3/8/1P5P/6K1/5R2 w - - 0 1",
    solution: ["Qf8+", "Rxf8", "Rxf8+", "Kd7", "e6#"]
  },
  {
    order: 857,
    fen: "k7/2p1r3/K1P2n2/3Nb3/3R4/5B2/8/8 w - - 0 1",
    solution: ["Nb6+", "cxb6", "c7+", "Nd5", "Bxd5#"]
  },
  {
    order: 858,
    fen: "r3r1k1/1p1b1p2/p1n1p1qQ/8/8/2N3R1/8/7K w - - 0 1",
    solution: ["Ne4", "Qxg3", "Nf6#"]
  },
  {
    order: 859,
    fen: "2kr3r/pp2bp1p/n1p1b2n/3N2p1/1qQ5/1N4B1/PPP2PPP/1K1R1B1R w - - 0 1",
    solution: ["Qxc6+", "bxc6", "Bxa6+", "Qb7", "Nxe7#"]
  },
  {
    order: 860,
    fen: "r1b1k1nr/p2p1ppp/n2B4/1p1NPN1P/6P1/3P1Q2/P1P1K3/q7 w kq - 0 1",
    solution: ["Nxg7+", "Kd8", "Qf6+", "Nxf6", "Be7#"]
  },
  {
    order: 861,
    fen: "k7/1pp5/3b4/p7/1nQNB3/3P1P2/2Pr3q/1R3K2 w - - 0 1",
    solution: ["Qa6+", "Nxa6", "Bxb7+", "Ka7", "Nc6#"]
  },
  {
    order: 862,
    fen: "3N4/7p/6p1/4Bn1k/6R1/7K/6P1/2r1q3 w - - 0 1",
    solution: ["Rg5+", "Kxg5", "Nf7+", "Kh5", "g4#"]
  },
  {
    order: 863,
    fen: "6K1/3r3r/5kn1/5p2/5P2/6N1/8/4R1R1 w - - 0 1",
    solution: ["Nh5+", "Rxh5", "Rxg6+", "Kxg6", "Re6#"]
  },
  {
    order: 864,
    fen: "8/5K1n/r2p4/4k1r1/4p3/6P1/5N2/3R1R2 w - - 0 1",
    solution: ["Ng4+", "Rxg4", "Rf5+", "Kxf5", "Rd5#"]
  },
  {
    order: 865,
    fen: "r6k/p4p1p/5P2/5N2/8/8/8/5KR1 w - - 0 1",
    solution: ["Nh6", "Rf8", "Rg8+", "Rxg8", "Nxf7#"]
  },
  {
    order: 866,
    fen: "2b2r2/1pn3pk/r7/p3N3/2Q2p1N/7R/Pq4PP/5R1K w - - 0 1",
    solution: ["Qe6", "Bxe6", "Nf5+", "Kg8", "Ne7#"]
  },
  {
    order: 867,
    fen: "rn4nr/pppq2bk/7p/5b1P/4NBQ1/3B4/PPP3P1/R4K1R w - - 0 1",
    solution: ["Qg6+", "Bxg6", "Ng5+", "hxg5", "hxg6#"]
  },
  {
    order: 868,
    fen: "rnq2rk1/pp3pbp/5Bp1/2pN4/3p4/8/3Q2b1/6K1 w - - 0 1",
    solution: ["Qh6", "Bxf6", "Nxf6+", "Kh8", "Qxh7#"]
  },
  {
    order: 869,
    fen: "6R1/r7/4KN1k/2p5/8/8/8/8 w - - 0 1",
    solution: ["Kf5", "Rg7", "Rh8+", "Rh7", "Rxh7#"]
  },
  {
    order: 870,
    fen: "4r3/5r1p/R1p2p2/1p1bk3/2p2NPP/2P1K3/2P2P2/3R4 w - - 0 1",
    solution: ["Rxd5+", "cxd5", "Ng6+", "hxg6", "f4#"]
  },
  {
    order: 871,
    fen: "8/1b3pkp/6p1/8/p4N2/Pq2Q1P1/2r4P/3R2K1 w - - 0 1",
    solution: ["Nh5+", "gxh5", "Qg5+", "Kf8", "Rd8#"]
  },
  {
    order: 872,
    fen: "r1b2nrk/pp3ppp/1q2p3/2bpn1N1/5N2/2PQ4/PPB2PPP/R1B2RK1 w - - 0 1",
    solution: ["Qxh7+", "Nxh7", "Nxf7+", "Nxf7", "Ng6#"]
  },
  {
    order: 873,
    fen: "8/8/7p/5Kpk/5p1b/8/6P1/4N3 w - - 0 1",
    solution: ["g4+", "fxg3", "Ng2", "g4", "Nf4#"]
  },
  {
    order: 874,
    fen: "8/kpP5/p7/Bb1q4/8/K7/1P6/2R5 w - - 0 1",
    solution: ["Bb6+", "Kxb6", "c8=N+", "Ka5", "b4#"]
  },
  {
    order: 875,
    fen: "r2rb3/pNR3pp/k4p2/8/P4B2/2p5/6PP/1R4K1 w - - 0 1",
    solution: ["Rc6+", "Bxc6", "Nc5+", "Ka5", "Bc7#"]
  },
  {
    order: 876,
    fen: "3B2k1/pb3p1p/1p4p1/8/8/P1Q2PqP/1P3rP1/3R2K1 w - - 0 1",
    solution: ["Qh8+", "Kxh8", "Bf6+", "Kg8", "Rd8#"]
  },
  {
    order: 877,
    fen: "r4r2/pp1R3p/5pk1/2p2p2/2P2P2/1P6/P7/3R3K w - - 0 1",
    solution: ["Rg1+", "Kh6", "Rd2", "Kh5", "Rh2#"]
  },
  {
    order: 878,
    fen: "1k6/1Pb5/K1P4p/B5p1/6P1/5p1P/4p3/8 w - - 0 1",
    solution: ["Bb6", "Bxb6", "Kxb6", "e1=Q", "c7#"]
  },
  {
    order: 879,
    fen: "1k1rr3/1ppq1ppp/1b6/8/8/2P3P1/4QPBP/RR4K1 w - - 0 1",
    solution: ["Ra8+", "Kxa8", "Qa6+", "Kb8", "Qxb7#"]
  },
  {
    order: 880,
    fen: "r3q1kr/ppp5/3p2pQ/8/3PP1b1/5R2/PPP3P1/5RK1 w - - 0 1",
    solution: ["Rf8+", "Qxf8", "Rxf8+", "Rxf8", "Qxg6#"]
  },
  {
    order: 881,
    fen: "k4r2/1R4pb/1pQp1n1p/3P4/5p1P/3P2P1/r1q1R2K/8 w - - 0 1",
    solution: ["Rxb6+", "Qxc6", "Rxa2+", "Qa4", "Rxa4#"]
  },
  {
    order: 882,
    fen: "8/1pn1rp1k/p3r2p/3b1R2/3PN1R1/qP1BP3/P2K2PP/8 w - - 0 1",
    solution: ["Rxf7+", "Rxf7", "Nf6+", "Kh8", "Rg8#"]
  },
  {
    order: 883,
    fen: "R6n/1p2r1pk/p1p4p/3qBP2/6P1/4Q2P/PP5K/8 w - - 0 1",
    solution: ["Qxh6+", "Kxh6", "Rxh8+", "Kg5", "Rh5#"]
  },
  {
    order: 884,
    fen: "r3r1k1/1pp1q1n1/3p2p1/3P1pP1/p2Q1P1R/8/PPP5/2K4R w - - 0 1",
    solution: ["Rh8+", "Kf7", "Qxg7+", "Kxg7", "R1h7#"]
  },
  {
    order: 885,
    fen: "k7/pb6/1p1Q4/N4q2/5pr1/2p5/6PP/3R3K w - - 0 1",
    solution: ["Qc6", "Bxc6", "Rd8+", "Qc8", "Rxc8#"]
  },
  {
    order: 886,
    fen: "3rk3/p4brp/4P2b/3p1P2/q4n1Q/2B5/2R4P/2R4K w - - 0 1",
    solution: ["Qxd8+", "Kxd8", "Bf6+", "Ke8", "Rc8#"]
  },
  {
    order: 887,
    fen: "r1b3kr/ppp1Bp1p/1b6/n2P4/6q1/2Q2N2/P4PPP/R3R1K1 w - - 0 1",
    solution: ["Qxh8+", "Kxh8", "Bf6+", "Kg8", "Re8#"]
  },
  {
    order: 888,
    fen: "4r2k/3R3p/2n4B/4bp2/pP6/P6P/2N2qB1/4R2K w - - 0 1",
    solution: ["Bg7+", "Bxg7", "Rxe8+", "Bf8", "Rxf8#"]
  },
  {
    order: 889,
    fen: "6k1/5p2/p5np/4B3/3P4/1PP1q3/P3r1QP/6RK w - - 0 1",
    solution: ["Qa8+", "Kh7", "Qh8+", "Nxh8", "Rg7#"]
  },
  {
    order: 890,
    fen: "1r3r2/1b2p3/p2p2R1/k1pQ4/1p1n4/1P2N1Pq/2P2P2/6K1 w - - 0 1",
    solution: ["Qxc5+", "dxc5", "Nc4+", "Kb5", "Rb6#"]
  },
  {
    order: 891,
    fen: "r1q4k/2p1r3/p2p1NQB/4b3/2Ppp3/1P6/P4PP1/5RK1 w - - 0 1",
    solution: ["Bg7+", "Rxg7", "Qh5+", "Rh7", "Qxh7#"]
  },
  {
    order: 892,
    fen: "4r3/5R2/6pp/6k1/8/1B4K1/2P1r2P/8 w - - 0 1",
    solution: ["h4+", "Kh5", "Rf5+", "g5", "Bf7#"]
  },
  {
    order: 893,
    fen: "8/7r/R7/4pkp1/7p/4PP2/3K2P1/8 w - - 0 1",
    solution: ["g4+", "hxg3", "e4+", "Kf4", "Rf6#"]
  },
  {
    order: 894,
    fen: "8/1rp1R3/p6p/1p6/6k1/6P1/5K1P/8 w - - 0 1",
    solution: ["Re5", "b4", "Kg2", "Rb5", "h3#"]
  },
  {
    order: 895,
    fen: "4Qnk1/1p3Rp1/2p2pBp/p1b5/2P2P2/P6P/1q6/5K2 w - - 0 1",
    solution: ["Rxf8+", "Bxf8", "Qf7+", "Kh8", "Qxf8#"]
  },
  {
    order: 896,
    fen: "3r3r/p3bpk1/1pp3p1/2Pqp1P1/4N3/3P1Q1R/P4PK1/7R w - - 0 1",
    solution: ["Qf6+", "Bxf6", "gxf6+", "Kf8", "Rxh8#"]
  },
  {
    order: 897,
    fen: "r1b2rk1/pp1p1p1p/2n3pQ/5qB1/8/2P5/P4PPP/4RRK1 w - - 0 1",
    solution: ["Qxf8+", "Kxf8", "Bh6+", "Kg8", "Re8#"]
  },
  {
    order: 898,
    fen: "r6r/ppp3R1/3n1R1p/8/7k/7P/PPP3P1/2K5 w - - 0 1",
    solution: ["Rf4+", "Kh5", "g3", "Nf5", "Rxf5#"]
  },
  {
    order: 899,
    fen: "r3nr1k/1b2b1pp/4Pp2/p1pq1N1Q/N2p1B2/6R1/PPP2PPP/R5K1 w - - 0 1",
    solution: ["Qxh7+", "Kxh7", "Rh3+", "Kg8", "Nxe7#"]
  },
  {
    order: 900,
    fen: "2r1n1k1/3RR2p/p5pB/1p2N3/8/6PP/P1q2PK1/8 w - - 0 1",
    solution: ["Rxe8+", "Rxe8", "Rg7+", "Kh8", "Nf7#"]
  },
  {
    order: 901,
    fen: "2r2r1k/p4pp1/1p2p2p/2qbN2n/5Q1P/3B2R1/PPP2P2/2K3R1 w - - 0 1",
    solution: ["Qxh6+", "gxh6", "Rg8+", "Rxg8", "Nxf7#"]
  },
  {
    order: 902,
    fen: "q1r1rkn1/pb2b2p/1p1p2p1/2nP1N2/2P5/1P1BQ3/PB3PPP/2R1R1K1 w - - 0 1",
    solution: ["Bg7+", "Kf7", "Qe6+", "Nxe6", "dxe6#"]
  },
  {
    order: 903,
    fen: "5kr1/pppr2p1/1q1p1p1R/2b2P1B/4P3/1Q6/PPP5/1K5R w - - 0 1",
    solution: ["Qxg8+", "Kxg8", "Rh8+", "Kxh8", "Bf7#"]
  },
  {
    order: 904,
    fen: "5rk1/1q3ppp/pn3b2/1p3Q2/8/1P3P2/PBP4P/2KR4 w - - 0 1",
    solution: ["Qxf6", "gxf6", "Rg1+", "Kh8", "Bxf6#"]
  },
  {
    order: 905,
    fen: "5rk1/5ppp/p1B5/2Q1Pb2/1r6/q7/1PP3PP/1K1R3R w - - 0 1",
    solution: ["Qxf8+", "Kxf8", "Rd8+", "Ke7", "Re8#"]
  },
  {
    order: 906,
    fen: "8/6p1/4b1Rp/4q2k/7b/1B6/2PB2Q1/2K5 w - - 0 1",
    solution: ["Qg4+", "Bxg4", "Rxh6+", "gxh6", "Bf7#"]
  },
  {
    order: 907,
    fen: "5Q2/2q4r/kp1p4/pRbBp1pP/P3P3/8/1PP5/1K6 w - - 0 1",
    solution: ["Qa8+", "Qa7", "Rxb6+", "Kxb6", "Qc6#"]
  },
  {
    order: 908,
    fen: "5rk1/nq1n1p1p/4p1p1/1p2Q3/3N4/P1BP4/5PPP/5RK1 w - - 0 1",
    solution: ["Qg7+", "Kxg7", "Nf5+", "Kg8", "Nh6#"]
  },
  {
    order: 909,
    fen: "r1bk2Br/ppp1b2p/2np4/6B1/4P3/3P1Q2/PqP3PP/RN3RK1 w - - 0 1",
    solution: ["Qf8+", "Kd7", "Be6+", "Kxe6", "Qf5#"]
  },
  {
    order: 910,
    fen: "r3kb1r/pbqn1pp1/1p5p/2p1p3/4n2B/1QP5/PP1NBPPP/R3K1NR w KQkq - 0 1",
    solution: ["Qe6+", "fxe6", "Bh5+", "g6", "Bxg6#"]
  },
  {
    order: 911,
    fen: "2bnrrk1/pp4pp/2q1pn2/3p2N1/3P1N2/8/PPQ2PPP/1B1RR1K1 w - - 0 1",
    solution: ["Qxh7+", "Nxh7", "Bxh7+", "Kh8", "Ng6#"]
  },
  {
    order: 912,
    fen: "r6k/pp2BpRp/8/8/4N3/8/qPP5/2KR4 w - - 0 1",
    solution: ["Rg8+", "Kxg8", "Rg1+", "Kh8", "Bf6#"]
  },
  {
    order: 913,
    fen: "kN1R1r2/pnQ5/8/8/q7/8/1p4PP/7K w - - 0 1",
    solution: ["Na6+", "Rxd8", "Qb8+", "Rxb8", "Nc7#"]
  },
  {
    order: 914,
    fen: "1k2r2r/1p4p1/1P5p/2N1p3/RR4n1/8/5PPP/6K1 w - - 0 1",
    solution: ["Ra8+", "Kxa8", "Nd7", "e4", "Ra4#"]
  },
  {
    order: 915,
    fen: "1q3r1k/p3N1pp/6b1/8/R1Q5/7P/5PP1/7K w - - 0 1",
    solution: ["Qg8+", "Rxg8", "Nxg6+", "hxg6", "Rh4#"]
  },
  {
    order: 916,
    fen: "r1b1k2r/pp2bppp/8/3N2q1/2p5/8/PPP2PPP/R2QR1K1 w kq - 0 1",
    solution: ["Nc7+", "Kf8", "Qd8+", "Bxd8", "Re8#"]
  },
  {
    order: 917,
    fen: "r1bqr3/pp1kn1pp/2pp4/6B1/1P6/PBp5/2P2PPP/R2QR1K1 w - - 0 1",
    solution: ["Qxd6+", "Kxd6", "Bf4+", "Kd7", "Be6#"]
  },
  {
    order: 918,
    fen: "6kr/1q2r1p1/1p2N1Q1/5p2/1P1p4/6R1/7P/2R3K1 w - - 0 1",
    solution: ["Rc8+", "Qxc8", "Qxg7+", "Rxg7", "Rxg7#"]
  },
  {
    order: 919,
    fen: "6rr/p2b1pk1/1pn1p1p1/2qpPP2/3N2P1/2P1Q3/P2B2K1/2R4R w - - 0 1",
    solution: ["Qh6+", "Rxh6", "Bxh6+", "Kh7", "Bf8#"]
  },
  {
    order: 920,
    fen: "r2nkb1r/1p1b1p1p/pB2p1P1/P2pP3/1P4PQ/3q4/3N3P/5RK1 w kq - 0 1",
    solution: ["Qxd8+", "Rxd8", "gxf7+", "Ke7", "Bc5#"]
  },
  {
    order: 921,
    fen: "rb3r2/1p2qB1p/p5pk/6Nb/1P3pPQ/P3P3/1B5P/R5K1 w - - 0 1",
    solution: ["Ne6", "Qf6", "g5+", "Qxg5+", "Qxg5#"]
  },
  {
    order: 922,
    fen: "2r4k/5rp1/pb3p1p/npqP1P2/2p1B1RQ/7R/PB4PP/7K w - - 0 1",
    solution: ["Qxh6+", "gxh6", "Rxh6+", "Rh7", "Bxf6#"]
  },
  {
    order: 923,
    fen: "3r1r1k/1q2Bppp/p1bpp3/1p3P2/3Q1R2/2n4R/PPP1B1PP/7K w - - 0 1",
    solution: ["Qxg7+", "Kxg7", "Rg4+", "Kh8", "Bf6#"]
  },
  {
    order: 924,
    fen: "3r3k/1b2rpp1/p2qpN1p/1p6/4pP1Q/P5R1/1PP3PP/5R1K w - - 0 1",
    solution: ["Rh3", "gxf6", "Qxh6+", "Kg8", "Qh8#"]
  },
  {
    order: 925,
    fen: "r1b1kb1r/3pnppp/p1p4n/qp4N1/4P3/PQ6/B4PPP/2qR2K1 w kq - 0 1",
    solution: ["Qxf7+", "Nxf7", "Bxf7+", "Kd8", "Ne6#"]
  },
  {
    order: 926,
    fen: "3r1rk1/pp3ppp/3pn3/1qpN4/5PP1/P5PQ/1PP5/1K1R4 w - - 0 1",
    solution: ["Ne7+", "Kh8", "Qxh7+", "Kxh7", "Rh1#"]
  },
  {
    order: 927,
    fen: "2r3k1/pp4p1/7p/1b2P1NQ/4N3/3P3P/2q2PPK/8 w - - 0 1",
    solution: ["Nf6+", "Kh8", "Qg6", "hxg5", "Qh7#"]
  },
  {
    order: 928,
    fen: "r4r1k/pb2b1p1/1pp1p1Qp/3nN3/4NP1q/3B4/PPP3PP/1K1R3R w - - 0 1",
    solution: ["Qh7+", "Kxh7", "Nf6+", "Kh8", "Ng6#"]
  },
  {
    order: 929,
    fen: "r3r2k/1R6/8/8/4N3/6P1/p4PK1/8 w - - 0 1",
    solution: ["Nf6", "Ra7", "Rxa7", "Re7", "Rxe7", "a1=Q", "Rh7#"]
  },
  {
    order: 930,
    fen: "8/4pkPp/7B/3K4/8/8/8/8 w - - 0 1",
    solution: ["g8=Q+", "Kxg8", "Ke6", "Kh8", "Kf7", "e5", "Bg7#"]
  },
  {
    order: 931,
    fen: "4r2k/pppb2pp/8/3Q2N1/1P1P1P2/P5K1/1B3PPP/n2q4 w - - 0 1",
    solution: ["Nf7+", "Kg8", "Nh6+", "Kh8", "Qg8+", "Rxg8", "Nf7#"]
  },
  {
    order: 932,
    fen: "1rr3k1/3R1p1p/b3P1p1/6P1/p7/P7/K7/B3R3 w - - 0 1",
    solution: ["exf7+", "Kf8", "Re8+", "Rxe8", "Bg7+", "Kxg7", "fxe8=Q#"]
  },
  {
    order: 933,
    fen: "4Q3/8/5K1k/8/8/8/8/1q6 w - - 0 1",
    solution: ["Qe3+", "Kh7", "Qe7+", "Kh6", "Qg7+", "Kh5", "Qg5#"]
  },
  {
    order: 934,
    fen: "4R3/5ppk/7p/3BpP2/3b4/1P4QP/r5PK/3q4 w - - 0 1",
    solution: ["Qg6+", "fxg6", "Bg8+", "Kh8", "Bf7+", "Kh7", "fxg6#"]
  },
  {
    order: 935,
    fen: "rq3rk1/pp4p1/4b3/2bNpp1Q/2B4P/8/PPP3P1/2KR3R w - - 0 1",
    solution: ["Ne7+", "Bxe7", "Bxe6+", "Rf7", "Qxf7+", "Kh7", "Qh5#"]
  },
  {
    order: 936,
    fen: "3r3k/p3N1b1/6pp/8/5p1p/1Q1BP3/1P4PK/4q3 w - - 0 1",
    solution: ["Qg8+", "Rxg8", "Nxg6+", "Kh7", "Ne5+", "Kh8", "Nf7#"]
  },
  {
    order: 937,
    fen: "2q1bbk1/1p4rp/4pQ2/1P6/3B2P1/3B4/2P4R/6K1 w - - 0 1",
    solution: ["Bxh7+", "Kh8", "Bg6+", "Kg8", "Rh8+", "Kxh8", "Qxf8#"]
  },
  {
    order: 938,
    fen: "r1bq3r/ppp2pkp/2nb4/7Q/2pp4/2P5/PP3PPP/RNB1R1K1 w - - 0 1",
    solution: ["Bh6+", "Kg8", "Qg5+", "Qxg5", "Re8+", "Bf8", "Rxf8#"]
  },
  {
    order: 939,
    fen: "1nr1r2k/2q1b1pp/p3P2N/1p1P4/1p2Q3/7P/6P1/BR3RK1 w - - 0 1",
    solution: ["Bxg7+", "Kxg7", "Rf7+", "Kxh6", "Qxh7+", "Kg5", "Rf5#"]
  },
  {
    order: 940,
    fen: "5rr1/1P1K4/1k6/1p2B3/1p6/8/8/2R5 w - - 0 1",
    solution: ["b8=Q+", "Rxb8", "Bd4+", "Ka6", "Ra1+", "Kb7", "Ra7#"]
  },
  {
    order: 941,
    fen: "2q4k/2P2Kp1/6P1/5nP1/8/1R6/8/8 w - - 0 1",
    solution: ["Rh3+", "Nh6+", "Rxh6+", "gxh6", "g7+", "Kh7", "g6#"]
  },
  {
    order: 942,
    fen: "8/1p3Q2/3q2p1/8/3r2k1/8/1P1np2P/R6K w - - 0 1",
    solution: ["Rg1+", "Kh3", "Qh7+", "Rh4", "Qd7+", "Qe6", "Rg3#"]
  },
  {
    order: 943,
    fen: "r3rk2/p3Rp1p/1qp1bQ2/8/1p1P4/6R1/PP3PPP/6K1 w - - 0 1",
    solution: ["Rd7", "Bxd7", "Qd6+", "Re7", "Qh6+", "Ke8", "Rg8#"]
  },
  {
    order: 944,
    fen: "r3r2k/p2n1Qpp/b7/q2NNp2/1pB5/8/P4PPP/3R1RK1 w - - 0 1",
    solution: ["Ng6+", "hxg6", "Rd3", "Nf8", "Ne7", "Rxe7", "Qg8#"]
  },
  {
    order: 945,
    fen: "r1b1kbr1/1p2qp1p/pn6/5p1N/8/1BP2pP1/PP1Q1P1P/3R1RK1 w q - 0 1",
    solution: ["Nf6+", "Qxf6", "Rfe1+", "Be6", "Ba4+", "Nd7", "Qxd7#"]
  },
  {
    order: 946,
    fen: "r1nqb1rk/1ppn3p/p2p1pp1/3Pp3/4P1Q1/P1P4R/1PB2PPP/2BR2K1 w - - 0 1",
    solution: ["Rxh7+", "Kxh7", "Qh3+", "Kg7", "Bh6+", "Kf7", "Qe6#"]
  },
  {
    order: 947,
    fen: "2r1rk2/p1q3pQ/4p3/1pppP1N1/8/4P2P/PP3P2/1K4R1 w - - 0 1",
    solution: ["Nxe6+", "Ke7", "Rxg7+", "Kxe6", "Qg6+", "Kxe5", "f4#"]
  },
  {
    order: 948,
    fen: "k5r1/p4b2/2P5/5p2/3P1P2/4QBrq/P5P1/4R1K1 w - - 0 1",
    solution: ["Qe8+", "Rxe8", "Rxe8+", "Bxe8", "c7+", "Rxf3", "c8=Q#"]
  },
  {
    order: 949,
    fen: "1rb2rk1/3n1ppp/8/3Pp1P1/1p1qN3/p2B2RQ/PPP4P/2K2R2 w - - 0 1",
    solution: ["Qxh7+", "Kxh7", "Nf6+", "Kh8", "Rh3+", "Qh4", "Rxh4#"]
  },
  {
    order: 950,
    fen: "r3r1k1/pbqpnpp1/1p1bp3/4n1NQ/1P2N3/2P4P/P4PP1/R1B2RK1 w - - 0 1",
    solution: ["Nf6+", "gxf6", "Qh7+", "Kf8", "Nxe6+", "dxe6", "Bh6#"]
  },
  {
    order: 951,
    fen: "1rb2r2/p3Rpkp/1p3Np1/2n2pQ1/8/1B6/Pq3PPP/2R3K1 w - - 0 1",
    solution: ["Rxf7+", "Rxf7", "Nh5+", "Kh8", "Qd8+", "Rf8", "Qxf8#"]
  },
  {
    order: 952,
    fen: "2q2r2/5rk1/4pNpp/p2pPn2/P1pP2QP/2P2R2/2B3P1/6K1 w - - 0 1",
    solution: ["Qxg6+", "Kh8", "Bxf5", "exf5", "Qxh6+", "Rh7", "Qxh7#"]
  },
  {
    order: 953,
    fen: "1r2qk2/p3p2R/3pBb2/2pP2p1/8/P5P1/2Q2PK1/8 w - - 0 1",
    solution: ["Rh8+", "Bxh8", "Qh7", "Qg6", "Qxg6", "Bg7", "Qf7#"]
  },
  {
    order: 954,
    fen: "7k/pp2b2p/3pQ1pB/3nP3/5p2/2r2P2/q1BK4/2R4R w - - 0 1",
    solution: ["Bg7+", "Kxg7", "Rxh7+", "Kxh7", "Qxg6+", "Kh8", "Qh7#"]
  },
  {
    order: 955,
    fen: "r4r2/pb3pk1/1pn3p1/2ppqPQ1/8/2NBP3/PP4P1/2KR3R w - - 0 1",
    solution: ["f6+", "Kg8", "Rh8+", "Kxh8", "Qh6+", "Kg8", "Qg7#"]
  },
  {
    order: 956,
    fen: "b5rk/4bR2/p6P/3pP2R/Pq1N4/1P6/7P/6QK w - - 0 1",
    solution: ["Qg7+", "Rxg7", "hxg7+", "Kg8", "Rh8+", "Kxf7", "g8=Q#"]
  },
  {
    order: 957,
    fen: "r1k2b1r/pp4pp/2p1n3/3NQ1B1/6q1/8/PPP2P1P/2KR4 w - - 0 1",
    solution: ["Qc7+", "Nxc7", "Nb6+", "Kb8", "Rd8+", "Qc8", "Rxc8#"]
  },
  {
    order: 958,
    fen: "r1bn1r1k/1p2b1p1/p4nQ1/3qN3/3P3N/2P5/P1B2PPP/R4RK1 w - - 0 1",
    solution: ["Qh7+", "Nxh7", "Nhg6+", "Kg8", "Nxe7+", "Kh8", "N5g6#"]
  },
  {
    order: 959,
    fen: "r1bq2r1/pp3pk1/4p1p1/2p3b1/3P1BN1/7Q/PPP2PP1/R3K2R w KQ - 0 1",
    solution: ["Qh6+", "Bxh6", "Bxh6+", "Kh7", "Bf8+", "Qh4", "Rxh4#"]
  },
  {
    order: 960,
    fen: "r3kb1r/pp1n1ppp/8/1BqN1pB1/3p4/8/PPP3PP/R2Q2K1 w kq - 0 1",
    solution: ["Nc7+", "Qxc7", "Qe2+", "Qe5", "Qxe5+", "Be7", "Qxe7#"]
  },
  {
    order: 961,
    fen: "r1b1Rn1k/1pbqNrp1/p6p/2Bp4/1P5Q/P5P1/4P1P1/1B4K1 w - - 0 1",
    solution: ["Qxh6+", "gxh6", "Bd4+", "Be5", "Bxe5+", "Rf6", "Bxf6#"]
  },
  {
    order: 962,
    fen: "2brrb2/8/p7/7Q/1p1kpPp1/1P1pN1P1/3K4/8 w - - 0 1",
    solution: ["Qa5", "Bb7", "Nf5#"]
  },
  {
    order: 963,
    fen: "7r/5bp1/p4p2/2k2np1/PNp2B2/2P5/1P4PP/3R2K1 w - - 0 1",
    solution: ["Rd6", "Nxd6", "Be3#"]
  },
  {
    order: 964,
    fen: "5rk1/p4p1p/4nQp1/8/6P1/3p1p1P/3B1P2/1q3BK1 w - - 0 1",
    solution: ["Bc3", "Nd4", "Bxd4", "Qxf1+", "Kxf1", "d2", "Qg7#"]
  },
  {
    order: 965,
    fen: "rnbqkb1r/pp1ppppp/2p2n2/6B1/3P4/4P3/PPP2PPP/RN1QKBNR b KQkq - 0 1",
    solution: ["Qa5+", "Nc3", "Qxg5"]
  },
  {
    order: 966,
    fen: "8/7P/4KBk1/8/8/8/8/8 w - - 0 1",
    solution: ["h8=N+"]
  },
  {
    order: 967,
    fen: "8/p7/2pp3q/3n2p1/3B2Pk/2P2P2/P7/6K1 w - - 0 1",
    solution: ["Kh2", "Ne3", "Bxe3", "Qf6", "Bf2#"]
  },
  {
    order: 968,
    fen: "r2q1k1r/p3bpp1/2p4p/2Bp4/4B1PP/4Q3/PPP5/2K1R3 w - - 0 1",
    solution: ["Bh7", "Rxh7", "Bxe7+", "Qxe7", "Qxe7+"]
  },
  {
    order: 969,
    fen: "7k/1b1r2p1/p6p/1p2qN2/3bP3/3Q4/P5PP/1B1R3K b - - 0 1",
    solution: ["Bg1", "Kxg1", "Rxd3"]
  },
  {
    order: 970,
    fen: "q7/2k5/3pp3/5pp1/3n4/2N1P2p/P1QP1P1P/7K w - - 0 1",
    solution: ["Nd5+", "Kd7", "Qc7+", "Ke8", "Qe7#"]
  },
  {
    order: 971,
    fen: "8/2p3k1/3bR3/3r1r1p/1p1PKPp1/6P1/P7/2B4R w - - 0 1",
    solution: ["Re5", "Bxe5", "fxe5", "Rf7", "Kxd5"]
  },
  {
    order: 972,
    fen: "R1R2rk1/6p1/5r1p/4p1N1/8/3n3P/5PP1/6K1 w - - 0 1",
    solution: ["Nh7", "Kxh7", "Rxf8", "Rxf8", "Rxf8"]
  },
  {
    order: 973,
    fen: "8/8/8/8/5n2/8/3k1n1K/4n1N1 w - - 0 1",
    solution: ["Nf3+", "Nxf3+", "Kg3", "N4h3", "Kxf3"]
  },
  {
    order: 974,
    fen: "5rk1/pp4pp/4p3/2R3Q1/3n4/2q4r/P1P2PPP/5RK1 b - - 0 1",
    solution: ["Qg3", "Qxg3", "Ne2+", "Kh1", "Nxg3+", "fxg3", "Rxf1#"]
  },
  {
    order: 975,
    fen: "3q4/1R5p/p6k/8/1P1N1pP1/4P3/7P/6K1 w - - 0 1",
    solution: ["Rg7", "Kxg7", "Ne6+", "Kf6", "Nxd8"]
  },
  {
    order: 976,
    fen: "2r2rk1/1bpR1p2/1pq1pQp1/p3P2p/P1PR4/5N1P/2P2PPK/8 w - - 0 1",
    solution: ["Kg3", "Rce8", "Kf4", "Bc8", "Kg5"]
  },
  {
    order: 977,
    fen: "r4rk1/ppq2p1p/2p1bQ2/8/2nR1K2/1NP2B1P/P1P2PP1/4R3 w - - 0 1",
    solution: ["Kg5", "Bd5", "Kh6"]
  },
  {
    order: 978,
    fen: "1nq3k1/r3b1p1/pp2prNp/2p5/4Q3/2P1P1B1/P4PPP/2R2RK1 w - - 0 1",
    solution: ["Qa8", "Rxa8", "Nxe7+", "Kh8", "Nxc8"]
  },
  {
    order: 979,
    fen: "r4rk1/pbp2ppp/1p3Q2/8/2P5/2BR3P/PP2qPP1/6K1 b - - 0 1",
    solution: ["Qg4", "hxg4", "gxf6"]
  },
  {
    order: 980,
    fen: "3r2k1/4Pp1p/Q7/8/2Nb4/8/PP2p1PP/5RK1 w - - 0 1",
    solution: ["Ne3", "Bxe3+", "Kh1"]
  },
  {
    order: 981,
    fen: "2k5/ppp2p1p/8/8/2Nb4/6qP/PP6/3RR2K w - - 0 1",
    solution: ["Re8+", "Kd7", "Re3", "Qh4", "Rxd4+", "Qxd4", "Rd3", "Qxd3", "Ne5+", "Kd6", "Nxd3"]
  },
  {
    order: 982,
    fen: "5k2/1p6/2p1BP2/p3P1P1/6p1/P5r1/3K4/4r3 w - - 0 1",
    solution: ["g6"]
  },
  {
    order: 983,
    fen: "2kr4/ppp3Pp/4RP1B/2r5/5P2/1P6/P2p4/3K4 w - - 0 1",
    solution: ["Rd6", "Rxd6", "g8=Q+", "Kd7", "Qxh7+", "Kc6", "Qe4+", "Kb6", "Qb4+", "Kc6", "Qxc5+", "Kxc5", "f7"]
  },
  {
    order: 984,
    fen: "3r4/1Pk3pp/K3b3/pBB1Pp2/8/2P5/PP4PP/7q w - - 0 1",
    solution: ["Ka7", "Qxh2", "Bb6#"]
  },
  {
    order: 985,
    fen: "4K3/4N3/3pkp2/3rpr2/8/8/4P3/8 w - - 0 1",
    solution: ["e4", "Rh5", "exd5#"]
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
