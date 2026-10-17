use std::{cmp::Ordering, fmt};

#[derive(Debug)]
struct Rect {
    w: u32,
    h: u32,
}

impl Rect {
    fn area(&self) -> u32 {
        self.w * self.h
    }

    fn stretch(&mut self, factor: (u32, u32)) -> &Self {
        self.w *= factor.0;
        self.h *= factor.1;
        self
    }

    fn cmp(&self, other: &Self) -> RectCmp {
        match self.area().cmp(&other.area()) {
            Ordering::Less => RectCmp::Smaller,
            Ordering::Greater => RectCmp::Bigger,
            Ordering::Equal => RectCmp::Same,
        }
    }
}

enum RectCmp {
    Bigger,
    Smaller,
    Same,
}

impl std::fmt::Display for RectCmp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            RectCmp::Bigger => "bigger",
            RectCmp::Smaller => "smaller",
            RectCmp::Same => "the same",
        };

        write!(f, "{}", name)
    }
}

fn main() {
    println!("Hello, world!");
    let mut a = Rect { w: 2, h: 3 };
    let mut b = Rect { w: 4, h: 5 };

    println!("{a:?}");
    println!("{b:?}");
    println!(
        "The area of a is {}, b is {}. a is {}, b is {}",
        a.area(),
        b.area(),
        a.cmp(&b),
        b.cmp(&a),
    );

    a.stretch((5, 4));
    println!("{a:?}");
    println!("{b:?}");
    println!(
        "The area of a is {}, b is {}. a is {}, b is {}",
        a.area(),
        b.area(),
        a.cmp(&b),
        b.cmp(&a),
    );

    b.stretch((1, 6));
    println!("{a:?}");
    println!("{b:?}");
    println!(
        "The area of a is {}, b is {}. a is {}, b is {}",
        a.area(),
        b.area(),
        a.cmp(&b),
        b.cmp(&a),
    );
}
