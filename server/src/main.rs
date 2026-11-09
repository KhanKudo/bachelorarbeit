use std::{
    env,
    error::Error,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    time::Duration,
};

// ----- spec -----

// struct Entity {
//     id: u8,
//     state: u32,
// }

// -----

// fn render(iteration: u16, ents: &[Entity]) {
//     print!("\x1B[2J\x1B[1;1H");
//     for ent in ents {
//         println!("[{iteration}] id: {:03} - state: {:03}", ent.id, ent.state)
//     }
// }

// fn handle(mut stream: TcpStream, ents: &mut [Entity]) -> Result<(), std::io::Error> {
//     stream
//         .set_read_timeout(Some(Duration::from_secs(1)))
//         .expect("Couldn't set read timeout for stream");
//     let mut buf = [0u8; 2];
//
//     loop {
//         stream.read_exact(&mut buf)?;
//         for ent in ents.iter_mut() {
//             if ent.id == buf[0] {
//                 ent.state = buf[1];
//                 return Ok(());
//             }
//         }
//     }
// }

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().collect();

    let id = args.get(1).expect("No id-argument passed!");
    let id: u8 = id.parse()?;

    if id == 0 {
        panic!("Provided invalid id(0), must be 1..255");
    }

    if let Some(state) = args.get(2) {
        let state: u32 = state
            .parse()
            .expect("Expected second parameter to be a state(u32)");
        let mut stream = TcpStream::connect(format!("127.0.0.1:3{id:03}"))?;
        stream.write(&state.to_le_bytes())?;
        return Ok(());
    }

    let device = TcpListener::bind(format!("0.0.0.0:3{id:03}"))
        .expect("Couldn't bind listener to device port");

    let mut state: u32 = 100;

    let mut iteration: u16 = 0;

    println!(
        "\x1B[2J\x1B[1;1H[{iteration}] id: {:03} - state: {:>5}",
        id, state
    );

    let mut buf = [0u8; 4];

    println!("Started listener...");
    for stream in device.incoming() {
        let mut stream = match stream {
            Ok(ok) => ok,
            Err(_) => {
                println!("An incoming connection has failed to open!");
                continue;
            }
        };
        println!("New connection!");
        iteration += 1;

        stream
            .set_read_timeout(Some(Duration::from_secs(1)))
            .expect("Couldn't set read timeout for stream");

        stream.read_exact(&mut buf)?;

        drop(stream);

        state = u32::from_le_bytes(buf);

        println!("Connection closed, listening...");
        println!(
            "\x1B[2J\x1B[1;1H[{iteration}] id: {:03} - state: {:>5}",
            id, state
        );
    }

    Ok(())
}
