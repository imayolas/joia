import { createUserOnWorkspaceContext } from '@/server/auth/userOnWorkspaceContext'
import { prisma } from '@/server/db'
import { PermissionsVerifier } from '@/server/permissions/PermissionsVerifier'
import { AppFactory } from '@/server/testing/factories/AppFactory'
import { UserFactory } from '@/server/testing/factories/UserFactory'
import { WorkspaceFactory } from '@/server/testing/factories/WorkspaceFactory'
import { KeyValueType } from '@/shared/globalTypes'
import { PermissionAction } from '@/shared/permissions/permissionDefinitions'
import type { App, KeyValue, User, Workspace } from '@prisma/client'
import { upsertAppKeyValuesService } from '../upsertAppKeyValues.service'

interface PayloadKeyValue {
  key: string
  value: string | number | boolean | null
}

const subject = async (
  userId: string,
  workspaceId: string,
  appId: string,
  keyValues: PayloadKeyValue[],
) => {
  const context = await createUserOnWorkspaceContext(
    prisma,
    workspaceId,
    userId,
  )
  return await upsertAppKeyValuesService(prisma, context, { appId, keyValues })
}

describe('updateAppKeyValuesService', () => {
  let workspace: Workspace
  let user: User
  let app: App
  let kv1AsString: KeyValue
  let kv2AsNumber: KeyValue
  let kv3AsBoolean: KeyValue

  beforeEach(async () => {
    workspace = await WorkspaceFactory.create(prisma)

    user = await UserFactory.create(prisma, {
      workspaceId: workspace.id,
    })

    app = await AppFactory.create(prisma, {
      userId: user.id,
      workspaceId: workspace.id,
    })

    kv1AsString = await prisma.keyValue.create({
      data: {
        key: 'key1',
        value: 'value1',
        appId: app.id,
        type: KeyValueType.String,
      },
    })

    kv2AsNumber = await prisma.keyValue.create({
      data: {
        key: 'key2',
        value: '2',
        appId: app.id,
        type: KeyValueType.Number,
      },
    })

    kv3AsBoolean = await prisma.keyValue.create({
      data: {
        key: 'key3',
        value: 'true',
        appId: app.id,
        type: KeyValueType.Boolean,
      },
    })
  })

  describe('inserting key values', () => {
    it('inserts a string kv', async () => {
      const keyValues = [{ key: 'key4', value: 'pepe' }]
      await subject(user.id, workspace.id, app.id, keyValues)
      const dbKvs = await prisma.keyValue.findMany({
        where: {
          appId: app.id,
        },
        orderBy: {
          key: 'asc',
        },
      })

      expect(dbKvs[3]).toEqual(
        expect.objectContaining({
          type: KeyValueType.String,
          value: keyValues[0]!.value,
        }),
      )
    })

    it('inserts a number kv', async () => {
      const keyValues = [{ key: 'key4', value: 123456 }]
      await subject(user.id, workspace.id, app.id, keyValues)
      const dbKvs = await prisma.keyValue.findMany({
        where: {
          appId: app.id,
        },
        orderBy: {
          key: 'asc',
        },
      })

      expect(dbKvs[3]).toEqual(
        expect.objectContaining({
          type: KeyValueType.Number,
          value: keyValues[0]!.value.toString(),
        }),
      )
    })

    it('inserts a boolean kv', async () => {
      const keyValues = [{ key: 'key4', value: true }]
      await subject(user.id, workspace.id, app.id, keyValues)
      const dbKvs = await prisma.keyValue.findMany({
        where: {
          appId: app.id,
        },
        orderBy: {
          key: 'asc',
        },
      })

      expect(dbKvs[3]).toEqual(
        expect.objectContaining({
          type: KeyValueType.Boolean,
          value: keyValues[0]!.value.toString(),
        }),
      )
    })
  })

  describe('updating key values', () => {
    it('updates a kv', async () => {
      const keyValues = [{ key: 'key1', value: 132 }]
      await subject(user.id, workspace.id, app.id, keyValues)
      const dbKvs = await prisma.keyValue.findMany({
        where: {
          appId: app.id,
        },
        orderBy: {
          key: 'asc',
        },
      })

      expect(dbKvs[0]).toEqual(
        expect.objectContaining({
          type: KeyValueType.Number,
          value: '132',
        }),
      )
    })
  })

  describe('deleting key values', () => {
    it('deletes a kv', async () => {
      const dbKvsCount = await prisma.keyValue.count({
        where: {
          appId: app.id,
        },
      })

      expect(dbKvsCount).toBe(3)

      const keyValues = [{ key: 'key1', value: null }]
      await subject(user.id, workspace.id, app.id, keyValues)
      const dbKvs = await prisma.keyValue.findMany({
        where: {
          appId: app.id,
        },
        orderBy: {
          key: 'asc',
        },
      })

      expect(dbKvs).toHaveLength(2)
      expect(dbKvs[0]!.key).not.toBe('key1')
    })
  })

  it('calls PermissionsVerifier', async () => {
    const spy = jest.spyOn(
      PermissionsVerifier.prototype,
      'passOrThrowTrpcError',
    )
    const keyValues = [{ key: 'key4', value: 'pepe' }]
    await subject(user.id, workspace.id, app.id, keyValues)

    expect(spy).toHaveBeenCalledWith(
      PermissionAction.Use,
      expect.anything(),
      expect.anything(),
    )
  })
})
