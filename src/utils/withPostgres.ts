// This file is part of the @egomobile/orm-pg distribution.
// Copyright (c) Next.e.GO Mobile SE, Aachen, Germany (https://e-go-mobile.com/)
//
// @egomobile/orm-pg is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as
// published by the Free Software Foundation, version 3.
//
// @egomobile/orm-pg is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

import pg from "pg";
import { createDataContext, EntityConfigurations, IDataAdapter, IDataContext } from "@egomobile/orm";
import { PostgreSQLDataAdapter } from "../classes/PostgreSQLDataAdapter";
import type { Constructor, Nilable } from "@egomobile/orm/lib/types/internal";
import type { ValueOrGetter } from "../types/internal";
import { PostgreSQLClientLike } from "../types";

/**
 * An entry in an `WithPostgresConnections` object.
 */
export interface IWithPostgresConnection {
    /**
     * Custom chunk size for cursor operations.
     *
     * @default `100`
     */
    chunkSize?: Nilable<number>;
    /**
     * The client configuration for `pg` module or the function, which returns it.
     */
    client: ValueOrGetter<Nilable<string | pg.ClientConfig>>;
    /**
     * The custom client class. Default is `pg.Client`.
     */
    clientClass?: Nilable<Constructor<any>>;
    /**
     * A custom class of a `pg-module` compatible class to do cursor operations.
     */
    cursorClass?: any;
    /**
     * The list of entity configurations or the function, which returns it.
     */
    entities: ValueOrGetter<EntityConfigurations>;
    /**
     * Indicates that the special value `NULL` should not be used
     * for this entity by default.
     */
    noDbNull?: Nilable<boolean>;
}

/**
 * Options for a 'withPostgres()' function.
 */
export interface IWithPostgresOptions {
    /**
     * Custom chunk size for cursor operations.
     *
     * @default `100`
     */
    chunkSize?: Nilable<number>;
    /**
     * Run action in transaction or not.
     */
    withTransaction?: Nilable<boolean>;
}

/**
 * An object, which stores the configuration data for known
 * PostgreSQL database connections.
 */
export type WithPostgresConnections = {
    /**
     * The required default connection.
     */
    "default": IWithPostgresConnection;

    /**
     * One or more additional, known connections.
     */
    [connectionName: string]: IWithPostgresConnection;
};

/**
 * An action for a `WithPostgresFunction`.
 *
 * @param {IDataContext} context The underlying data context.
 *
 * @returns {Promise<TResult>} The promise with the result.
 */
export type WithPostgresAction<TResult extends any = any> = (
    context: IDataContext,
) => Promise<TResult>;

/**
 * A 'withPostgres()' function.
 *
 * @param {keyof T} connection The name of the known connection.
 * @param {WithPostgresAction<TResult>} action The action to invoke.
 * @param {Nilable<IWithPostgresOptions>} [options] Additional and custom options.
 *
 * @returns {Promise<TResult>} The promise with the result of the action.
 */
export type WithPostgresFunction<T extends WithPostgresConnections = WithPostgresConnections> =
    <TResult extends any = any>(
        connection: keyof T,
        action: WithPostgresAction<TResult>,
        options?: Nilable<IWithPostgresOptions>
    ) => Promise<TResult>;

/**
 * Creates a function, which runs itself an action inside an open PostgreSQL connection.
 *
 * @param {TConnections} connections The list of known connections to registers.
 *
 * @example
 * ```
 * import { createWithPostgres } from "@egomobile/orm-pg"
 *
 * // `EntityConfigurations` objects, returned by functions
 * // exported as `default`s
 * import getDefaultEntityConfiguration from './entities/default'
 * import getTestEntityConfiguration from './entities/test'
 *
 *
 * const withPostges = createWithPostgres({
 *   "default": {
 *     "client": null,  // read `pg` config from environment variables
 *     "entities": getDefaultEntityConfiguration()
 *   },
 *
 *   "test1": {
 *     "client": 'postgresql://dbuser:secretpassword@database.server.com:3211/mydb',
 *     "entities": getTestEntityConfiguration()
 *   }
 * })
 *
 *
 * // `defaultResult` === "FOO"
 * const defaultResult = await withPostges('default', async (defaultContext) => {
 *   // do something with `default` connection in `defaultContext`
 *
 *   return "FOO"
 * })
 *
 * // `test1Result` === "bar"
 * const test1Result = await withPostges('test1', async (test1Context) => {
 *   // do something with `test1` connection in `test1Context`
 *
 *   return "bar"
 * })
 * ```
 *
 * @returns {WithPostgresFunction<TConnections>} The new function.
 */
export function createWithPostgres<TConnections extends WithPostgresConnections = WithPostgresConnections>(
    connections: TConnections
): WithPostgresFunction<TConnections> {
    return async (connectionName, action, options?) => {
        const knownConnection = connections[connectionName];

        if (!knownConnection) {
            throw new Error(`Connection ${connectionName as string} is unknown`);
        }

        const {
            "chunkSize": customChunkSize,
            "client": clientOrGetter,
            "clientClass": customClientClass,
            "cursorClass": customCursorClass,
            "entities": entityOrProvider
        } = knownConnection;

        let getClientConfig: () => Promise<Nilable<string | pg.ClientConfig>>;
        if (typeof clientOrGetter === "function") {
            getClientConfig = () => {
                return Promise.resolve(clientOrGetter());
            };
        }
        else {
            getClientConfig = async () => {
                return entityOrProvider as EntityConfigurations;
            };
        }

        let getEntityConfigurations: () => Promise<EntityConfigurations>;
        if (typeof entityOrProvider === "function") {
            getEntityConfigurations = () => {
                return Promise.resolve(entityOrProvider());
            };
        }
        else {
            getEntityConfigurations = async () => {
                return entityOrProvider;
            };
        }

        const adapterChunkSize = options?.chunkSize ?? customChunkSize;
        const shouldUseRunInTransaction = !!options?.withTransaction;

        let clientClass: Constructor<any> = pg.Client;
        if (customClientClass) {
            clientClass = customClientClass;
        }

        let client: pg.Client | pg.Pool | pg.PoolClient = new clientClass(await getClientConfig() || undefined);

        const clientToUse = await client.connect();
        if (clientToUse) {
            client = clientToUse;
        }

        if (shouldUseRunInTransaction) {
            await client.query("START TRANSACTION;");
        }

        try {
            const context = await createDataContext({
                "adapter": new PostgreSQLDataAdapter({
                    "chunkSize": adapterChunkSize,
                    "client": client as PostgreSQLClientLike,
                    "cursorClass": customCursorClass
                }) as IDataAdapter,
                "entities": await getEntityConfigurations(),
                "noDbNull": knownConnection.noDbNull
            });

            const result = await action(context);

            if (shouldUseRunInTransaction) {
                await client.query("COMMIT;");
            }

            return result;
        }
        catch (ex) {
            if (shouldUseRunInTransaction) {
                await client.query("ROLLBACK;");
            }

            throw ex;
        }
        finally {
            if ("end" in client) {
                await client.end();
            }
        }
    };
}
