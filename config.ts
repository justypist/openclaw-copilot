import { loadEnvConfig } from '@next/env'

const projectDir = process.cwd()
loadEnvConfig(projectDir)

export const config = {
  openclaw: {
    root: process.env.OPENCLAW_ROOT || '',
  },
};
