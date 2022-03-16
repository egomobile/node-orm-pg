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

import { DataAdapterBase, IFindOneOptions, IFindOptions } from '@egomobile/orm';
import type { Constructor, List, Nilable } from '@egomobile/orm/lib/types/internal';
import { Client, ClientConfig, Pool, PoolClient, PoolConfig, QueryResult } from 'pg';
import { isExplicitNull } from '@egomobile/orm';
import type { PostgreSQLClientLike } from '../types';
import type { Getter } from '../types/internal';
import { asList, isNil } from '../utils/internal';

/**
 * Options for 'find()' method of a 'PostgreSQLDataAdapter' instance.
 */
export interface IPostgreSQLFindOptions extends IPostgreSQLFindOneOptions, IFindOptions {
    /**
     * @inheritdoc
     */
    fields?: Nilable<string[]>;
    /**
     * @inheritdoc
     */
    params?: Nilable<any[]>;
    /**
     * Sort settings.
     */
    sort?: Nilable<Record<string, 'ASC' | 'DESC'>>;
    /**
     * @inheritdoc
     */
    where?: Nilable<string>;
}

/**
 * Options for 'findOne()' method of a 'PostgreSQLDataAdapter' instance.
 */
export interface IPostgreSQLFindOneOptions extends IFindOneOptions {
    /**
     * @inheritdoc
     */
    fields?: Nilable<string[]>;
    /**
     * @inheritdoc
     */
    params?: Nilable<any[]>;
    /**
     * Sort settings.
     */
    sort?: Nilable<Record<string, 'ASC' | 'DESC'>>;
    /**
     * @inheritdoc
     */
    where?: Nilable<string>;
}

/**
 * Options for instance of 'PostgreSQLDataAdapter' class.
 */
export interface IPostgreSQLDataAdapterOptions {
    /**
     * The underlying client or a function, which returns it.
     */
    client?: Nilable<PostgreSQLClientLike | Getter<PostgreSQLClientLike> | PostgreSQLClientConfig>;
}

/**
 * A possible value for a pg client/pool configuration.
 */
export type PostgreSQLClientConfig = ClientConfig | PoolClient;

/**
 * A valid option value for 'PostgreSQLDataAdapter' class.
 */
export type PostgreSQLDataAdapterOptionsValue = IPostgreSQLDataAdapterOptions | PostgreSQLClientLike;

/**
 * A data adapter which is written for PostgreSQL databases.
 */
export class PostgreSQLDataAdapter extends DataAdapterBase {
    private readonly clientGetter: Getter<PostgreSQLClientLike>;

    /**
     * Initializes a new instance of that class.
     *
     * @param {Nilable<PostgreSQLDataAdapterOptionsValue>} optionsOrClient The options or the client/pool.
     */
    public constructor(optionsOrClient?: Nilable<PostgreSQLDataAdapterOptionsValue>) {
        super();

        let options: Nilable<IPostgreSQLDataAdapterOptions>;
        if (optionsOrClient instanceof Client || optionsOrClient instanceof Pool) {
            options = {
                client: optionsOrClient
            };
        } else {
            options = optionsOrClient;
        }

        if (!isNil(options)) {
            if (typeof options !== 'object') {
                throw new TypeError('optionsOrClient is invalid');
            }
        }

        this.clientGetter = toClientGetter(options?.client);
    }

    /**
     * @inheritdoc
     */
    public async find<T extends any = any>(type: Constructor<T>, options?: IPostgreSQLFindOptions | null): Promise<T[]> {
        const table = this.getTableNameByTypeOrThrow(type);

        const fields = options?.fields;
        if (!isNil(fields)) {
            if (!Array.isArray(fields)) {
                throw new TypeError('options.fields must be an array');
            }
        }

        const params = options?.params;
        if (!isNil(params)) {
            if (!Array.isArray(params)) {
                throw new TypeError('options.params must be an array');
            }
        }

        const sort = options?.sort;
        if (!isNil(sort)) {
            if (typeof sort !== 'object') {
                throw new TypeError('options.sort must be an object');
            }
        }

        const where = options?.where;
        if (!isNil(where)) {
            if (typeof where !== 'string') {
                throw new TypeError('options.where must be a string');
            }
        }

        const limit = options?.limit;
        if (!isNil(limit)) {
            if (typeof limit !== 'number') {
                throw new TypeError('options.limit must be a number');
            }
        }

        const offset = options?.offset;
        if (!isNil(offset)) {
            if (typeof offset !== 'number') {
                throw new TypeError('options.offset must be a number');
            }
        }

        const projection = fields?.length ?
            fields.map(f => `"${String(f)}"`).join(',') :
            '*';

        // build query
        let q = `SELECT ${projection} FROM ${table}`;
        if (where?.length) {
            q += ` WHERE (${where})`;
        }
        if (sort) {
            q += ` ORDER BY ${Object.entries(sort)
                .map((entry) => `"${entry[0]}" ${entry[1]}`)
                .join(',')}`;
        }
        if (!isNil(limit)) {
            q += ` LIMIT ${limit}`;
        }
        if (!isNil(offset)) {
            q += ` OFFSET ${offset}`;
        }
        q += ';';

        const sqlResult = await this.query(q, ...(params || []));

        const entities: T[] = [];
        for (const row of sqlResult.rows) {
            const newEntity: any = new type();

            for (const [columnName, value] of Object.entries(row)) {
                if (typeof value === 'function') {
                    continue;  // ignore methods
                }

                if (columnName in newEntity) {
                    newEntity[columnName] = value;  // only if column is prop of entity
                }
            }

            entities.push(newEntity);
        }

        return entities;
    }

    /**
     * @inheritdoc
     */
    public async findOne<T extends any = any>(type: Constructor<T>, options?: IPostgreSQLFindOneOptions | null): Promise<T | null> {
        const entities = await this.find(type, {
            ...(options || {}),
            limit: 1
        });

        return entities[0] || null;
    }

    /**
     * Gets the underlying client / pool.
     *
     * @returns {Promise<PostgreSQLClientLike>} The promise with the client.
     */
    public getClient(): Promise<PostgreSQLClientLike> {
        return Promise.resolve(this.clientGetter());
    }

    private getTableByTypeOrThrow(type: Constructor<any>) {
        for (const [table, config] of Object.entries(this.context.entities)) {
            if (config.type === type) {
                return {
                    table,
                    config
                };
            }
        }

        throw new Error(`Cannot use type ${type.name} for tables`);
    }

    /**
     * Returns the list of SQL table columns, which represent
     * the IDs of a row.
     *
     * @param {Constructor<any>} type The type.
     *
     * @returns {string} The name of the underlying SQL table.
     */
    public getTableIdsByType(type: Constructor<any>): string[] {
        const { config } = this.getTableByTypeOrThrow(type);

        if (config.ids?.length) {
            return config.ids;
        } else {
            return [];
        }
    }

    /**
     * Returns the list of SQL table columns, which represent
     * the IDs of a row, or throws an exception if not defined.
     *
     * @param {Constructor<any>} type The type.
     *
     * @returns {string} The name of the underlying SQL table.
     */
    public getTableIdsByTypeOrThrow(type: Constructor<any>): string[] {
        const ids = this.getTableIdsByType(type);

        if (ids.length) {
            return ids;
        }

        throw new Error(`No IDs defined for type ${type.name}`);
    }

    /**
     * Returns the SQL table name by type or throws an exception, if not configured.
     *
     * @param {Constructor<any>} type The type.
     *
     * @returns {string} The name of the underlying SQL table.
     */
    public getTableNameByTypeOrThrow(type: Constructor<any>): string {
        return this.getTableByTypeOrThrow(type).table;
    }

    /**
     * @inheritdoc
     */
    public async insert<T extends any = any>(entities: T | List<T>): Promise<T[]> {
        if (isNil(entities)) {
            throw new TypeError('entities cannot be (null) or (undefined)');
        }

        const result: T[] = [];

        for (const entity of asList(entities)!) {
            const type: Constructor = (entity as any).constructor;
            const table = this.getTableNameByTypeOrThrow(type);
            const idCols = this.getTableIdsByType(type);
            const valueCols = Object.keys(entity as any).filter(
                (columName) => !isNil((entity as any)[columName]),
            );

            const values: any[] = [];
            for (const c of valueCols) {
                const v = (entity as any)[c];

                values.push(isExplicitNull(v) ? null : v);
            }

            const columnList = valueCols.map((c) => `"${c}"`).join(',');
            const valueList = valueCols.map((c, i) => `$${i + 1}`).join(',');

            let returning = '';
            if (idCols.length) {
                returning = `RETURNING ${idCols.join(',')}`;
            }

            const queryResult = await this.query(
                `INSERT INTO ${table} (${columnList}) VALUES (${valueList})${returning};`,
                ...values,
            );

            if (idCols.length) {
                const row: Record<string, any> = queryResult.rows[0];

                // WHERE clause for getting new, inserted entity
                const whereInserted = Object.keys(row)
                    .map((columnName, index) => `"${columnName}"=$${index + 1}`)
                    .join(' AND ');
                const params = Object.values(row);

                // get new row as entity with new and updated data
                result.push(
                    await this.findOne(type, {
                        where: whereInserted,
                        params
                    })
                );
            } else {
                // no ID column(s), so return simple entity
                result.push(entity);
            }
        }

        return result;
    }

    /**
     * Invokes a raw SQL query.
     *
     * @param {string} sql The SQL query,
     * @param {any[]} [values] One or more values for the placeholders in the SQL query.
     *
     * @returns {Promise<QueryResult<any>>} The promise with the result.
     */
    public async query(sql: string, ...values: any[]): Promise<QueryResult<any>> {
        const client = await this.getClient();

        return client.query(sql, values);
    }

    /**
     * @inheritdoc
     */
    public async remove<T extends any = any>(entities: T | List<T>): Promise<T[]> {
        if (isNil(entities)) {
            throw new TypeError('entities cannot be (null) or (undefined)');
        }

        const result: T[] = [];

        for (const entity of asList(entities)!) {
            const type: Constructor = (entity as any).constructor;
            const table = this.getTableNameByTypeOrThrow(type);
            const idCols = this.getTableIdsByTypeOrThrow(type);

            // collect ID values
            const idValues: any[] = [];
            for (const c of idCols) {
                const v = (entity as any)[c];

                idValues.push(isExplicitNull(v) ? null : v);
            }

            let i = 0;

            // WHERE clause
            const where = idCols
                .map((columnName) => `"${columnName}" = $${++i} `)
                .join(' AND ');

            // build and run query
            await this.query(
                `DELETE FROM ${table} WHERE(${where}); `,
                ...idValues,
            );

            // simply return entity
            result.push(entity);
        }

        return result;
    }

    /**
     * @inheritdoc
     */
    public async update<T extends any = any>(entities: T | List<T>): Promise<T[]> {
        if (isNil(entities)) {
            throw new TypeError('entities cannot be (null) or (undefined)');
        }

        const result: T[] = [];

        for (const entity of asList(entities)!) {
            const type: Constructor = (entity as any).constructor;
            const table = this.getTableNameByTypeOrThrow(type);
            const idCols = this.getTableIdsByTypeOrThrow(type);
            const valueCols = Object.keys(entity as any).filter(
                (columName) => !idCols.includes(columName) && !isNil((entity as any)[columName]),
            );

            if (!valueCols.length) {
                continue;  // nothing to do
            }

            const addValuesTo = (cols: string[], vals: any[]) => {
                for (const c of cols) {
                    const v = (entity as any)[c];

                    vals.push(isExplicitNull(v) ? null : v);
                }
            };

            let i = 0;

            // values to update
            const values: any[] = [];
            addValuesTo(valueCols, values);
            const set = valueCols
                .map((columnName) => `"${columnName}" = $${++i}`)
                .join(',');

            // WHERE clause
            const idValues: any[] = [];
            addValuesTo(idCols, idValues);
            const where = idCols
                .map((columnName) => `"${columnName}" = $${++i}`)
                .join(' AND ');

            // now build and run query
            await this.query(
                `UPDATE ${table} SET ${set} WHERE(${where}); `,
                ...[...values, ...idValues],
            );

            // WHERE clause for getting updated entity
            const whereUpdated = idCols
                .map((columnName, index) => `"${columnName}" = $${index + 1}`)
                .join(' AND ');

            // get updated entity
            result.push(
                await this.findOne(type, {
                    where: whereUpdated,
                    params: idValues
                })
            );
        }

        return result;
    }
}

function toClientGetter(value: Nilable<PostgreSQLClientLike | Getter<PostgreSQLClientLike> | PostgreSQLClientConfig>): Getter<PostgreSQLClientLike> {
    if (typeof value === 'function') {
        return value;
    } else if (value instanceof Client || value instanceof Pool) {
        return async () => value;
    } else if (isNil(value) || typeof value === 'object') {
        const pool = new Pool(value as PoolConfig || undefined);

        return () => pool;
    }

    throw new TypeError('value cannot be used as client or pool');
}