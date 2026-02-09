# Remote VM (ClawCode)

SSH:
ssh -i /Users/jackwu/Work/OCI/ec2.pem ubuntu@18.142.226.39

Notes:
- VM already has @anthropic-ai/claude-agent-sdk@0.2.29 configured.
- ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN are set on the VM.
- Claude Agent SDK usage guide (authoritative on VM): `/home/ubuntu/jacktest/CLAUDE_AGENT_SDK_GUIDE.md`
- Use this VM to run any Claude Agent SDK live tests.

Verification (VM):
- `printenv ANTHROPIC_BASE_URL`
- `printenv ANTHROPIC_AUTH_TOKEN`
- Guide includes SDK query examples and permission modes: `/home/ubuntu/jacktest/CLAUDE_AGENT_SDK_GUIDE.md`
