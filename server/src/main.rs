use std::{
    io::Read,
    net::{TcpListener, TcpStream},
    time::Duration,
};

fn handle(mut stream: TcpStream) -> Result<(), std::io::Error> {
    stream
        .set_read_timeout(Some(Duration::from_secs(1)))
        .expect("Couldn't set read timeout for stream");
    let mut buf = [0u8; 1];

    loop {
        stream.read_exact(&mut buf)?;
        match buf[0] {
            0 => println!("---> OFF"),
            1 => println!("---> ON"),
            _ => println!("---> ???"),
        }
    }

    // Ok(())
}

fn main() {
    let listener = TcpListener::bind("0.0.0.0:3000").expect("Couldn't bind listener on socket.");

    println!("Started listener...");
    for stream in listener.incoming() {
        println!("New connection!");
        match stream {
            Ok(stream) => match handle(stream) {
                Ok(_) => (),
                Err(_) => println!("Client closed the connection or it timed out."),
            },
            Err(_) => println!("An incoming connection has failed to open!"),
        };
        println!("Connection closed, listening...");
    }
}
