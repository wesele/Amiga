#[allow(dead_code)]
struct GreetingModule;

#[allow(dead_code)]
impl GreetingModule {
    fn new() -> Self {
        Self
    }

    fn greet(&self, name: &str) -> String {
        format!("Hello, {}! Welcome to Idioma.", name)
    }
}
