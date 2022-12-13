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

import type { IDataContext } from "@egomobile/orm";
import { Nilable } from "@egomobile/orm/lib/types/internal";
import { Client, Pool } from "pg";
import type { PostgreSQLDataAdapter } from "../classes";

/**
 * A debug action.
 *
 * @param {string} message The message text.
 * @param {string} icon The icon.
 * @param {Nilable<string>} [source] The name of the optional source.
 */
export type DebugAction = (message: string, icon: DebugIcon, source?: Nilable<string>) => any;

/**
 * A possible value for a known debug icon.
 *
 * 🐞: debug
 * ✅: success
 * ℹ️: info
 * ❌: error
 * ⚠️: warning
 */
export type DebugIcon = "🐞" | "✅" | "ℹ️" | "❌" | "⚠️";

/**
 * Information, which can be used to create a new migration file.
 */
export interface INewMigrationInfo {
    /**
     * The sanitized base (file-)name without extension.
     */
    filename: string;
    /**
     * The name.
     */
    name: string;
    /**
     * The timestamp.
     */
    timestamp: number;
}

/**
 * A migration for a PostgreSQL database.
 */
export interface IPostgreSQLMigration {
    /**
     * The underlying module.
     */
    readonly module: IPostgreSQLMigrationModule;
    /**
     * The name.
     */
    name: string;
    /**
     * The UNIX timestamp in ms.
     */
    timestamp: number;
}

/**
 * A migration module.
 */
export interface IPostgreSQLMigrationModule {
    /**
     * The function to DOWNgrade a database.
     *
     * @param {PostgreSQLDataAdapter} adapter The underlying adapter.
     * @param {IDataContext} context The underlying database context.
     */
    down: MigrationAction;

    /**
     * The function to UPgrade a database.
     *
     * @param {PostgreSQLDataAdapter} adapter The underlying adapter.
     * @param {IDataContext} context The underlying database context.
     */
    up: MigrationAction;
}

/**
 * A migation action.
 *
 * @param {PostgreSQLDataAdapter} adapter The underlying adapter.
 * @param {IDataContext} context The underlying database context.
 * @param {DebugAction} debug The debug action.
 */
export type MigrationAction = (adapter: PostgreSQLDataAdapter, context: IDataContext, debug: DebugAction) => Promise<any>;

/**
 * An instance, which can be used as client.
 */
export type PostgreSQLClientLike = Client | Pool;
