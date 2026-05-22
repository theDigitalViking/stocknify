/**
 * Cycle 5-C — smoke tests for the new SFTP/FTP file-handling primitives.
 *
 * The library wrappers are mocked so we never open a socket; we just assert
 * each primitive invokes the right library method with the right arguments.
 * The behavioural value of these tests is small but they pin the wiring so
 * a future refactor that, say, swaps `ensureDir` for `mkdir` on the FTP
 * client (or changes the recursive flag on SFTP mkdir) trips the suite
 * before it ships to a remote server.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const sftpMocks = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn().mockResolvedValue(undefined),
  end: vi.fn().mockResolvedValue(undefined),
}))

const ftpMocks = vi.hoisted(() => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
}))

vi.mock('ssh2-sftp-client', () => {
  const ctor = vi.fn(function (this: object) {
    Object.assign(this, {
      connect: sftpMocks.connect,
      mkdir: sftpMocks.mkdir,
      rename: sftpMocks.rename,
      delete: sftpMocks.del,
      end: sftpMocks.end,
    })
  })
  return { __esModule: true, default: ctor }
})

vi.mock('basic-ftp', () => {
  class Client {
    ensureDir = ftpMocks.ensureDir
    rename = ftpMocks.rename
    remove = ftpMocks.remove
    access = ftpMocks.access
    close = ftpMocks.close
  }
  return {
    __esModule: true,
    Client,
    FileType: { File: 1, Directory: 2 },
  }
})

import {
  deleteFtpFile,
  ensureFtpDirectory,
  moveFtpFile,
} from '../ftp-client.js'
import {
  deleteSftpFile,
  ensureSftpDirectory,
  moveSftpFile,
} from '../sftp-client.js'

const sftpCfg = { host: 'h', port: 22, username: 'u', password: 'p' }
const ftpCfg = { host: 'h', port: 21, username: 'u', password: 'p', secure: false }

afterEach(() => {
  sftpMocks.mkdir.mockClear()
  sftpMocks.rename.mockClear()
  sftpMocks.del.mockClear()
  ftpMocks.ensureDir.mockClear()
  ftpMocks.rename.mockClear()
  ftpMocks.remove.mockClear()
})

describe('SFTP file-handling primitives (Cycle 5-C)', () => {
  it('ensureSftpDirectory calls mkdir with recursive=true', async () => {
    await ensureSftpDirectory(sftpCfg, '/exports/archive/2026-05')
    expect(sftpMocks.mkdir).toHaveBeenCalledWith('/exports/archive/2026-05', true)
  })

  it('moveSftpFile calls rename(src, dest)', async () => {
    await moveSftpFile(sftpCfg, '/exports/data.csv', '/exports/archive/2026-05/data.csv')
    expect(sftpMocks.rename).toHaveBeenCalledWith(
      '/exports/data.csv',
      '/exports/archive/2026-05/data.csv',
    )
  })

  it('deleteSftpFile calls delete(path)', async () => {
    await deleteSftpFile(sftpCfg, '/exports/data.csv')
    expect(sftpMocks.del).toHaveBeenCalledWith('/exports/data.csv')
  })
})

describe('FTP file-handling primitives (Cycle 5-C)', () => {
  it('ensureFtpDirectory calls ensureDir(path)', async () => {
    await ensureFtpDirectory(ftpCfg, '/exports/archive/2026-05')
    expect(ftpMocks.ensureDir).toHaveBeenCalledWith('/exports/archive/2026-05')
  })

  it('moveFtpFile calls rename(src, dest)', async () => {
    await moveFtpFile(ftpCfg, '/exports/data.csv', '/exports/archive/2026-05/data.csv')
    expect(ftpMocks.rename).toHaveBeenCalledWith(
      '/exports/data.csv',
      '/exports/archive/2026-05/data.csv',
    )
  })

  it('deleteFtpFile calls remove(path)', async () => {
    await deleteFtpFile(ftpCfg, '/exports/data.csv')
    expect(ftpMocks.remove).toHaveBeenCalledWith('/exports/data.csv')
  })
})
