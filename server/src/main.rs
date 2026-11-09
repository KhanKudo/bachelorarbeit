use std::{
    error::Error,
    io::Read,
    net::{TcpListener, TcpStream},
    time::Duration,
};

use rusqlite::{Connection, Params, Result};

// ----- spec -----

struct Entity {
    id: u8,
    state: u8,
}

// -----

fn render(iteration: u16, ents: &[Entity]) {
    print!("\x1B[2J\x1B[1;1H");
    for ent in ents {
        println!("[{iteration}] id: {:03} - state: {:03}", ent.id, ent.state)
    }
}

fn handle(mut stream: TcpStream, ents: &mut [Entity]) -> Result<(), std::io::Error> {
    stream
        .set_read_timeout(Some(Duration::from_secs(1)))
        .expect("Couldn't set read timeout for stream");
    let mut buf = [0u8; 2];

    loop {
        stream.read_exact(&mut buf)?;
        for ent in ents.iter_mut() {
            if ent.id == buf[0] {
                ent.state = buf[1];
                return Ok(());
            }
        }
    }
}

fn main() -> Result<(), Box<dyn Error>> {
    let sql = Connection::open_in_memory()?;

    sql.execute(
        "CREATE TABLE entity (
            id    INTEGER PRIMARY KEY,

        )",
        (),
    )?;

    let listener = TcpListener::bind("0.0.0.0:3000").expect("Couldn't bind listener on socket");

    let mut entities = [
        Entity { id: 0, state: 50 },
        Entity { id: 1, state: 100 },
        Entity { id: 2, state: 250 },
    ];

    let mut i: u16 = 0;

    render(i, &entities);

    println!("Started listener...");
    for stream in listener.incoming() {
        println!("New connection!");
        i += 1;
        match stream {
            Ok(stream) => match handle(stream, &mut entities) {
                Ok(_) => (),
                Err(_) => println!("Client closed the connection or it timed out."),
            },
            Err(_) => println!("An incoming connection has failed to open!"),
        };
        println!("Connection closed, listening...");
        render(i, &entities);
    }

    Ok(())
}
