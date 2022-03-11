/* eslint-disable unicorn/filename-case */

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

import fs from 'fs';
import path from 'path';
import MigrationsEntity, { Migrations } from './pocos/Migrations';
import type { Nilable } from '@egomobile/orm/lib/types/internal';
import type { PostgreSQLDataAdapter, PostgreSQLDataAdapterOptionsValue } from './PostgreSQLDataAdapter';
import { createDataContext, EntityConfigurations, IDataAdapter, IDataContext } from '@egomobile/orm';
import type { Getter } from '../types/internal';
import { IPostgreSQLMigration } from '../types';
import { isNil } from '../utils/internal';

/**
 * Options for 'down()' method of a 'PostgreSQLMigrationContext' instance.
 */
export interface IDownOptions {
    /**
     * The optional timestamp to downgrade to.
     */
    timestamp?: Nilable<number>;
}

/**
 * Options for 'PostgreSQLMigrationContext' class.
 */
export interface IPostgreSQLMigrationContextOptions {
    /**
     * Custom options for the adapter.
     */
    adapter?: Nilable<PostgreSQLDataAdapterOptionsValue>;
    /**
     * Migrations to use.
     *
     * If string: The path to the migration files. Relative paths will be mapped to current working directory.
     * If array: The list of migrations.
     * If function: The function, which returns the list of migrations.
     *
     * Default: Subdirectory 'migration' inside current working directory.
     */
    migrations?: Nilable<string | IPostgreSQLMigration[] | Getter<IPostgreSQLMigration[]>>;
    /**
     * The name of the migration table. Default: 'migrations'
     */
    table?: Nilable<string>;
    /**
     * Include TypeScript (.ts) files instead of .js
     */
    typescript?: Nilable<boolean>;
}

interface IRunMigrationContext {
    adapter: PostgreSQLDataAdapter;
    context: IDataContext;
    existingMigration: Migrations | undefined;
    migration: IPostgreSQLMigration;
}

interface IRunMigrationsOptions {
    executeMigration: (context: IRunMigrationContext) => Promise<void>;
    migrations: IPostgreSQLMigration[];
}

/**
 * Options for 'up()' method of a 'PostgreSQLMigrationContext' instance.
 */
export interface IUpOptions {
    /**
     * The optional timestamp to upgrade to.
     */
    timestamp?: Nilable<number>;
}

/**
 * A PostgreSQL migration context.
 */
export class PostgreSQLMigrationContext {
    /**
     * Initializes a new instance of that class.
     *
     * @param {IPostgreSQLMigrationContextOptions} options The options.
     */
    public constructor(public readonly options: IPostgreSQLMigrationContextOptions) {
        if (typeof options !== 'object') {
            throw new TypeError('options must be of type object');
        }
    }

    private async createContext() {
        const adapter: IDataAdapter = new (require('./PostgreSQLDataAdapter').PostgreSQLDataAdapter)(this.options?.adapter);
        const entities: EntityConfigurations = {};

        let table = this.options.table;
        if (isNil(table)) {
            table = 'migrations';
        } else {
            if (typeof table !== 'string') {
                throw new TypeError('options.table must be of tpe string');
            }
        }

        entities[table] = MigrationsEntity;

        return {
            adapter: adapter as PostgreSQLDataAdapter,
            context: await createDataContext({
                adapter,
                entities
            })
        };
    }

    /**
     * Downgrades the database.
     *
     * @param {Nilable<IDownOptions>} [options] The custom options.
     */
    public async down(options?: Nilable<IDownOptions>) {
        if (!isNil(options?.timestamp)) {
            if (typeof options!.timestamp !== 'number') {
                throw new TypeError('options.timestamp must be of type number');
            }
        }

        const allMigrations = await this.getMigrations();
        // sort migrations DESC-ENDING by timestamp
        allMigrations.sort((x, y) => y.timestamp - x.timestamp);

        let migrations: IPostgreSQLMigration[];
        if (typeof options?.timestamp === 'number') {
            migrations = [];

            for (const m of allMigrations) {
                if (m.timestamp === options.timestamp) {
                    break;  // ... target reached
                }

                migrations.push(m);
            }
        } else {
            migrations = allMigrations;
        }

        await this.runMigrations({
            migrations,
            executeMigration: async ({ adapter, context, existingMigration, migration }) => {
                if (!existingMigration) {
                    return;  // already executed or not available
                }

                await Promise.resolve(
                    migration.module.down(adapter, context)
                );

                await context.remove(existingMigration);
            }
        });
    }

    private async getMigrations(): Promise<IPostgreSQLMigration[]> {
        let { migrations } = this.options;
        if (isNil(migrations)) {
            migrations = path.join(process.cwd(), 'migration');
        }

        let loadedMigrations: IPostgreSQLMigration[];

        if (typeof migrations === 'string') {
            if (!path.isAbsolute(migrations)) {
                migrations = path.join(process.cwd(), migrations);
            }

            loadedMigrations = [];

            const rootDir = path.join(__dirname, 'script');

            const filesAndFolders = await fs.promises.readdir(rootDir);

            for (const item of filesAndFolders) {
                const rx = this.options.typescript ?
                    /^(\d+)(-)(.+)(\.ts)$/ : // (TIMESTAMP)-(NAME).ts
                    /^(\d+)(-)(.+)(\.js)$/; // (TIMESTAMP)-(NAME).js

                const match = rx.exec(item);
                if (!match) {
                    continue;
                }

                const fullPath = path.join(rootDir, item);

                const stat = await fs.promises.stat(fullPath);
                if (stat.isFile()) {
                    loadedMigrations.push({
                        module: require(fullPath),
                        name: match[3],
                        timestamp: parseInt(match[1], 10)
                    });
                }
            }
        } else if (Array.isArray(migrations)) {
            loadedMigrations = migrations;
        } else if (typeof migrations === 'function') {
            loadedMigrations = await Promise.resolve(migrations());
        } else {
            throw new TypeError('options.migrations must be of type string, array or function');
        }

        if (!Array.isArray(loadedMigrations)) {
            throw new TypeError('migrations must be of type array');
        }
        if (loadedMigrations.some(m => typeof m !== 'object')) {
            throw new TypeError('All items of migrations must be of type object');
        }

        return loadedMigrations;
    }

    private async runMigrations({ executeMigration, migrations }: IRunMigrationsOptions) {
        const { adapter, context } = await this.createContext();

        await context.query('START TRANSACTION;');
        try {
            const finishedMigrations = await context.find(Migrations);

            for (const m of migrations) {
                const existingMigration = finishedMigrations.find(
                    ({ name, timestamp }) =>
                        String(name) === String(m.name) &&
                        String(timestamp) === String(m.timestamp),
                );

                await executeMigration({
                    adapter,
                    context,
                    existingMigration,
                    migration: m
                });
            }

            await context.query('COMMIT;');
        } catch (ex) {
            await context.query('ROLLBACK;');

            throw ex;
        }
    }

    /**
     * Upgrades the database.
     *
     * @param {Nilable<IUpOptions>} [options] The custom options.
     */
    public async up(options?: Nilable<IUpOptions>) {
        if (!isNil(options?.timestamp)) {
            if (typeof options!.timestamp !== 'number') {
                throw new TypeError('options.timestamp must be of type number');
            }
        }

        const allMigrations = await this.getMigrations();
        // sort migrations ASC-ENDING by timestamp
        allMigrations.sort((x, y) => x.timestamp - y.timestamp);

        let migrations: IPostgreSQLMigration[];
        if (typeof options?.timestamp === 'number') {
            migrations = [];

            for (const m of allMigrations) {
                migrations.push(m);  // add ...

                if (m.timestamp === options.timestamp) {
                    break;  // ... until timestamp has been found
                }
            }
        } else {
            migrations = allMigrations;
        }

        await this.runMigrations({
            migrations,
            executeMigration: async ({ adapter, context, existingMigration, migration }) => {
                if (existingMigration) {
                    return;  // already executed
                }

                await Promise.resolve(
                    migration.module.up(adapter, context)
                );

                const newMigration = new Migrations();
                newMigration.name = migration.name;
                newMigration.timestamp = migration.timestamp;

                await context.insert(newMigration);
            }
        });
    }
}
