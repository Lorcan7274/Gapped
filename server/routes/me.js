import { normaliseDisplayName, DISTANCES, DURATION_MINUTES } from '../lib/validate.js'
import { selfPlayer } from '../lib/serialize.js'
import { renamePlayer } from '../db/players.js'
import { weekPoints } from '../db/runs.js'
import { weekOf } from '../lib/economy.js'
import { TIERS } from '../lib/ladder.js'
import { LADDER, DUEL } from '../config/game.js'

/** The signed-in player's own record, with this week's points. */
export function describeSelf(row) {
  return selfPlayer(row, { weekPoints: weekPoints(row.id, weekOf(Date.now())) })
}

export default async function meRoutes(app) {
  /**
   * Re-hydrate the signed-in player on reload. A dead session (expired,
   * signed out, or the player removed) returns 404 so the client can clear
   * storage and show sign-in again instead of hanging.
   */
  app.get('/api/me', { preHandler: app.requirePlayer }, async (request) => ({
    player: describeSelf(request.player),
  }))

  app.patch('/api/me/name', { preHandler: app.requirePlayer }, async (request, reply) => {
    const displayName = normaliseDisplayName(request.body?.displayName)
    if (!displayName) {
      return reply.code(400).send({ error: 'Pick a name between 2 and 24 characters.' })
    }
    return { player: describeSelf(renamePlayer(request.player.id, displayName)) }
  })

  /** Reference data the client renders against. */
  app.get('/api/meta', async () => ({
    tiers: TIERS.map(({ key, name, colour }) => ({ key, name, colour })),
    divisionsPerTier: LADDER.divisionsPerTier,
    duel: { fuelCost: DUEL.fuelCost, minDistanceM: DUEL.minDistanceM },
    // Shapes a live friend duel can take.
    live: { distances: DISTANCES, durationsMinutes: DURATION_MINUTES },
  }))
}
