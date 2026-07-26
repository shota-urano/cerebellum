use clap::{Parser, Subcommand};

pub const DEFAULT_PORT: u16 = 48210;

#[derive(Debug, Parser)]
#[command(name = "cerebellum", version, about)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Serve {
        #[arg(long, default_value_t = DEFAULT_PORT)]
        port: u16,
    },
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::{Cli, Command, DEFAULT_PORT};

    #[test]
    fn serve_uses_the_fixed_default_port() {
        let cli = Cli::try_parse_from(["cerebellum", "serve"]).expect("CLI should parse");

        assert!(matches!(
            cli.command,
            Command::Serve { port } if port == DEFAULT_PORT
        ));
    }
}
