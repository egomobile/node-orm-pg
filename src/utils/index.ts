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
import sanitizeFilename from 'sanitize-filename';
import { pascalCase } from 'change-case';
import type { INewMigrationInfo } from '../types';
import { Nilable } from '@egomobile/orm/lib/types/internal';
import { isNil } from './internal';

/**
 * Options for 'createNewMigration()' and 'createNewMigrationSync()' functions.
 */
export interface ICreateNewMigrationOptions {
    /**
     * The output directory. Default: Current work directory.
     */
    dir?: Nilable<string>;
    /**
     * Custom footer.
     */
    footer?: Nilable<string | MigrationFileStringBuilder>;
    /**
     * Custom header.
     */
    header?: Nilable<string | MigrationFileStringBuilder>;
    /**
     * Overwrite if file exist or not.
     */
    overwrite?: Nilable<boolean>;
    /**
     * Generate TypeScript (true) or JavaScript (false file).
     */
    typescript?: Nilable<boolean>;
}

/**
 * A context for a 'MigrationFileStringBuilder' function.
 */
export interface IMigrationFileStringBuilderContext {
    /**
     * The output directory.
     */
    dir: string;
    /**
     * The extension.
     */
    extension: string;
    /**
     * The filename without extension.
     */
    filename: string;
    /**
     * The name of the migration.
     */
    name: string;
    /**
     * The UNIX timestamp.
     */
    timestamp: number;
    /**
     * The type.
     */
    type: MigrationFileStringBuilderContextType;
}

export type MigrationFileStringBuilderContextType = 'footer' | 'header';

/**
 * A function, which create a string for a migration file.
 *
 * @param {IMigrationFileStringBuilderContext} context The underlying context.
 *
 * @returns {any} The value to stringify. (null) and (undefined) will become empty strings.
 */
export type MigrationFileStringBuilder = (context: IMigrationFileStringBuilderContext) => any;

/**
 * Creates a new migration file.
 *
 * @param {string} name The name of the new file.
 * @param {Nilable<ICreateNewMigrationOptions>} [options] Custom options.
 *
 * @returns {Promise<string>} The promise with the full path of the new file.
 */
export async function createNewMigrationFile(name: string, options?: Nilable<ICreateNewMigrationOptions>): Promise<string> {
    const { dir, extension, info, source } = getOptionsForCreateNewMigrationOrThrow(name, options);

    const fullPath = path.join(dir, info.filename + extension);
    if (!options?.overwrite) {
        if (fs.existsSync(fullPath)) {
            throw new Error(`Migration file ${fullPath} already exists`);
        }
    }

    await fs.promises.writeFile(fullPath, source, 'utf8');

    return fullPath;
}

/**
 * Creates a new migration file.
 *
 * @param {string} name The name of the new file.
 * @param {Nilable<ICreateNewMigrationOptions>} [options] Custom options.
 *
 * @returns {string} The full path of the new file.
 */
export function createNewMigrationFileSync(name: string, options?: Nilable<ICreateNewMigrationOptions>): string {
    const { dir, extension, info, source } = getOptionsForCreateNewMigrationOrThrow(name, options);

    const fullPath = path.join(dir, info.filename + extension);
    if (!options?.overwrite) {
        if (fs.existsSync(fullPath)) {
            throw new Error(`Migration file ${fullPath} already exists`);
        }
    }

    fs.writeFileSync(fullPath, source, 'utf8');

    return fullPath;
}

/**
 * Creates new data to create a new migration file.
 *
 * @param {string} name The name of the migration (file).
 *
 * @returns {INewMigrationInfo} The new info.
 */
export function createNewMigrationInfo(name: string): INewMigrationInfo {
    if (typeof name !== 'string') {
        throw new TypeError('name must be of type string');
    }

    const now = new Date();

    const filename = sanitizeFilename(`${now.valueOf()}-${pascalCase(name)}`);

    return {
        name,
        timestamp: now.valueOf(),
        filename
    };
}

function getOptionsForCreateNewMigrationOrThrow(name: string, options: Nilable<ICreateNewMigrationOptions>) {
    if (!isNil(options)) {
        if (typeof options !== 'object') {
            throw new TypeError('options must be of type object');
        }
    }

    let dir: Nilable<string>;
    let footerBuilder: MigrationFileStringBuilder;
    let headerBuilder: MigrationFileStringBuilder;

    dir = options?.dir;
    if (isNil(dir)) {
        dir = process.cwd();
    } else {
        if (typeof options?.dir !== 'string') {
            throw new TypeError('options.dir must be of type string');
        }
    }

    if (isNil(options?.footer)) {
        footerBuilder = () => '';
    } else {
        if (typeof options!.footer === 'string') {
            footerBuilder = () => options!.footer;
        } else if (typeof options!.footer === 'function') {
            footerBuilder = options!.footer;
        } else {
            throw new TypeError('options.footer must be of type string or function');
        }
    }

    if (isNil(options?.header)) {
        headerBuilder = () => '';
    } else {
        if (typeof options!.header === 'string') {
            headerBuilder = () => options!.header;
        } else if (typeof options!.header === 'function') {
            headerBuilder = options!.header;
        } else {
            throw new TypeError('options.header must be of type string or function');
        }
    }

    if (!path.isAbsolute(dir)) {
        dir = path.join(process.cwd(), dir);
    }

    const info = createNewMigrationInfo(name);
    const extension = options?.typescript ? '.ts' : '.js';

    const getStringBuilderValue = (type: MigrationFileStringBuilderContextType, func: MigrationFileStringBuilder) => {
        const context: IMigrationFileStringBuilderContext = {
            dir: dir!,
            extension,
            filename: info.filename,
            name: info.name,
            timestamp: info.timestamp,
            type
        };

        const val = func(context);
        return isNil(val) ? '' : String(val);
    };

    let source: string;
    if (options?.typescript) {
        source = `${getStringBuilderValue('header', headerBuilder)}import type { IDataContext } from '@egomobile/orm';

/**
 * Function to UP-GRADE the database.
 *
 * @param {IDataContext} context The current data context.
 */
export const up = async (context: IDataContext): Promise<any> => {
    // context => https://egomobile.github.io/node-orm/interfaces/IDataContext.html

    throw new Error('up() not implemented!');
};

/**
 * Function to DOWN-GRADE the database.
 *
 * @param {IDataContext} context The current data context.
 */
export const down = async (context: IDataContext): Promise<any> => {
    // context => https://egomobile.github.io/node-orm/interfaces/IDataContext.html

    throw new Error('down() not implemented!');
};
${getStringBuilderValue('footer', footerBuilder)}`;
    } else {
        source = `${getStringBuilderValue('header', headerBuilder)}/**
 * Function to UP-GRADE the database.
 *
 * @param {IDataContext} context The current data context.
 */
module.exports.up = async (context) => {
    // context => https://egomobile.github.io/node-orm/interfaces/IDataContext.html

    throw new Error('up() not implemented!');
};

/**
 * Function to DOWN-GRADE the database.
 *
 * @param {IDataContext} context The current data context.
 */
module.exports.down = async (context) => {
    // context => https://egomobile.github.io/node-orm/interfaces/IDataContext.html

    throw new Error('down() not implemented!');
};
${getStringBuilderValue('footer', footerBuilder)}`;
    }

    return {
        dir,
        extension,
        info,
        source
    };
}
