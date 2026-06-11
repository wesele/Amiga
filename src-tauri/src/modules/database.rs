pub struct Database;

impl Database {
    pub fn new() -> Self {
        Self
    }

    pub fn init(&self) {
        println!("[database] module initialized");
    }
}
