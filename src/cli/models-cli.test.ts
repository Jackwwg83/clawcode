import { beforeEach, describe, expect, it, vi } from "vitest";

const githubCopilotLoginCommand = vi.fn();
const modelsStatusCommand = vi.fn().mockResolvedValue(undefined);
const modelsProvidersAddCommand = vi.fn().mockResolvedValue(undefined);
const modelsProvidersListCommand = vi.fn().mockResolvedValue(undefined);
const modelsProvidersRemoveCommand = vi.fn().mockResolvedValue(undefined);

vi.mock("../commands/models.js", async () => {
  const actual =
    await vi.importActual<typeof import("../commands/models.js")>("../commands/models.js");

  return {
    ...actual,
    githubCopilotLoginCommand,
    modelsStatusCommand,
    modelsProvidersAddCommand,
    modelsProvidersListCommand,
    modelsProvidersRemoveCommand,
  };
});

describe("models cli", () => {
  beforeEach(() => {
    githubCopilotLoginCommand.mockClear();
    modelsStatusCommand.mockClear();
    modelsProvidersAddCommand.mockClear();
    modelsProvidersListCommand.mockClear();
    modelsProvidersRemoveCommand.mockClear();
  });

  it("registers github-copilot login command", { timeout: 60_000 }, async () => {
    const { Command } = await import("commander");
    const { registerModelsCli } = await import("./models-cli.js");

    const program = new Command();
    registerModelsCli(program);

    const models = program.commands.find((cmd) => cmd.name() === "models");
    expect(models).toBeTruthy();

    const auth = models?.commands.find((cmd) => cmd.name() === "auth");
    expect(auth).toBeTruthy();

    const login = auth?.commands.find((cmd) => cmd.name() === "login-github-copilot");
    expect(login).toBeTruthy();

    await program.parseAsync(["models", "auth", "login-github-copilot", "--yes"], {
      from: "user",
    });

    expect(githubCopilotLoginCommand).toHaveBeenCalledTimes(1);
    expect(githubCopilotLoginCommand).toHaveBeenCalledWith(
      expect.objectContaining({ yes: true }),
      expect.any(Object),
    );
  });

  it("passes --agent to models status", async () => {
    const { Command } = await import("commander");
    const { registerModelsCli } = await import("./models-cli.js");

    const program = new Command();
    registerModelsCli(program);

    await program.parseAsync(["models", "status", "--agent", "poe"], { from: "user" });

    expect(modelsStatusCommand).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "poe" }),
      expect.any(Object),
    );
  });

  it("passes parent --agent to models status", async () => {
    const { Command } = await import("commander");
    const { registerModelsCli } = await import("./models-cli.js");

    const program = new Command();
    registerModelsCli(program);

    await program.parseAsync(["models", "--agent", "poe", "status"], { from: "user" });

    expect(modelsStatusCommand).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "poe" }),
      expect.any(Object),
    );
  });

  it("shows help for models auth without error exit", async () => {
    const { Command } = await import("commander");
    const { registerModelsCli } = await import("./models-cli.js");

    const program = new Command();
    program.exitOverride();
    registerModelsCli(program);

    try {
      await program.parseAsync(["models", "auth"], { from: "user" });
      expect.fail("expected help to exit");
    } catch (err) {
      const error = err as { exitCode?: number };
      expect(error.exitCode).toBe(0);
    }
  });

  it("registers providers subcommand", async () => {
    const { Command } = await import("commander");
    const { registerModelsCli } = await import("./models-cli.js");

    const program = new Command();
    registerModelsCli(program);

    const models = program.commands.find((cmd) => cmd.name() === "models");
    expect(models).toBeTruthy();

    const providers = models?.commands.find((cmd) => cmd.name() === "providers");
    expect(providers).toBeTruthy();

    const add = providers?.commands.find((cmd) => cmd.name() === "add");
    expect(add).toBeTruthy();

    const list = providers?.commands.find((cmd) => cmd.name() === "list");
    expect(list).toBeTruthy();

    const remove = providers?.commands.find((cmd) => cmd.name() === "remove");
    expect(remove).toBeTruthy();
  });

  it("calls providers add with all options", async () => {
    const { Command } = await import("commander");
    const { registerModelsCli } = await import("./models-cli.js");

    const program = new Command();
    registerModelsCli(program);

    await program.parseAsync(
      [
        "models",
        "providers",
        "add",
        "--id",
        "my-provider",
        "--base-url",
        "https://api.example.com/v1",
        "--api",
        "anthropic-messages",
        "--model",
        "my-model",
        "--set-default",
      ],
      { from: "user" },
    );

    expect(modelsProvidersAddCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "my-provider",
        baseUrl: "https://api.example.com/v1",
        api: "anthropic-messages",
        model: "my-model",
        setDefault: true,
      }),
      expect.any(Object),
    );
  });

  it("calls providers list with --json", async () => {
    const { Command } = await import("commander");
    const { registerModelsCli } = await import("./models-cli.js");

    const program = new Command();
    registerModelsCli(program);

    await program.parseAsync(["models", "providers", "list", "--json"], { from: "user" });

    expect(modelsProvidersListCommand).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
      expect.any(Object),
    );
  });

  it("calls providers remove with provider id", async () => {
    const { Command } = await import("commander");
    const { registerModelsCli } = await import("./models-cli.js");

    const program = new Command();
    registerModelsCli(program);

    await program.parseAsync(["models", "providers", "remove", "my-provider"], { from: "user" });

    expect(modelsProvidersRemoveCommand).toHaveBeenCalledWith("my-provider", expect.any(Object));
  });
});
