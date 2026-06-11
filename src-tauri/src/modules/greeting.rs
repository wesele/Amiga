pub struct GreetingModule;

impl GreetingModule {
    pub fn new() -> Self {
        Self
    }

    pub fn greet(&self, name: &str) -> String {
        format!("Hello, {}! Welcome to Idioma.", name)
    }
}
