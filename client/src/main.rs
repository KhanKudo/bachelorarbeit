use std::{io::Write, net::TcpStream};

fn main() -> Result<(), std::io::Error> {
    let mut stream = TcpStream::connect("127.0.0.1:3000").expect("Failed to connect to the server");

    let mut buf = [0u8; 1];
    stream.write(&dbg!(buf))?;
    buf[0] = 1;
    stream.write(&dbg!(buf))?;
    buf[0] = 2;
    stream.write(&dbg!(buf))?;

    Ok(())
}
