import { interfaces, Container, inject, typeConstraint, injectable } from 'inversify';
import { InversifyPartialMap } from './partial-map';
import { GraphQLSchema } from 'graphql';
import { inversifySchema } from './build';
import { IInversifyExtensibleNode, InversifyObjectTypeBuilder, ExtensibleSchemaSymbol, IExtSchema } from './object-builder';
import { TypeCache } from './type-cache';
import { InversifyObjectConfig, InversifyFieldList, InversifySchemaConfig, IInversifyExtensibleSchema } from './interfaces';
import { InversifySchemaBuilder } from './schema-builder';

@injectable()
export class InversifyExtensibleNode<TSource = any, TContext = any> implements IInversifyExtensibleNode {

    private readonly extensions: interfaces.Newable<InversifyPartialMap<any, TContext>>[] = [];
    typeName: string;
    useParentExtensions = false;
    for (name: string) {
        this.typeName = name;
        return this;
    }


    /** Merge the given field list definitions in the current node */
    merge(...fields: interfaces.Newable<InversifyPartialMap<TSource, TContext>>[]): this {
        this.extensions.push(...fields);
        return this;
    }


    buildType(): interfaces.Newable<InversifyObjectTypeBuilder<any, any>> {
        if (!this.extensions.length)
            return null;
        // create a temp class
        const that = this;
        class Temp extends InversifyObjectTypeBuilder<TSource, TContext> {
            private _globalMap: InversifyFieldList<TSource, TContext> = {};

            constructor() {
                super();
                super.extensions = that.useParentExtensions ? 'noDirect' : 'none';
            }

            config(): InversifyObjectConfig<TSource, TContext> {const names = new Set();
                for (const ext of that.extensions) {
                    let thisMap = this.builders.get(ext).map();
                    if (typeof thisMap === 'function')
                        thisMap = thisMap();
                    for (const fname of Object.keys(thisMap)) {
                        // if (names.has(fname))
                        //     throw new Error('Cannot merge GraphQL type ' + that.typeName + ' because two different extensions are declaring a field named ' + fname);
                        names.add(fname);
                        this._globalMap[fname] = thisMap[fname];
                    }
                }
                return {
                    name: that.typeName,
                    fields: this._globalMap,
                };
            }

        }
        // return it
        return Temp;
    }
}


export class InversifyExtensibleSchema<TContext = any> implements IExtSchema {
    readonly query: InversifyExtensibleNode<void, TContext>;
    readonly mutation: InversifyExtensibleNode<void, TContext>;
    readonly subscription: InversifyExtensibleNode<void, TContext>;
    readonly nodes = new Map<string, InversifyExtensibleNode<any, TContext>>();
    container: Container;
    private parents:  this[] = [];

    constructor(name: string, container: Container) {
        const c = this.container = new Container();
        c.parent = container;
        c.bind(Container).toConstantValue(c);
        c.bind(ExtensibleSchemaSymbol).toConstantValue(this);

        this.query = this.get(name + 'Queries');
        this.mutation = this.get(name + 'Mutations');
        this.subscription = this.get(name + 'Subscriptions');
        for (const q of [this.query, this.mutation, this.subscription]) {
            q.useParentExtensions = true;
        }
    }

    private create(typeName: string) {
        return this.container.resolve<InversifyExtensibleNode<void, TContext>>(InversifyExtensibleNode)
            .for(typeName)
    }

    get<TSource = any>(typeToExtend: string): InversifyExtensibleNode<TSource, TContext> {
        let node = this.nodes.get(typeToExtend);
        if (!this.nodes.has(typeToExtend))
            this.nodes.set(typeToExtend, node = this.create(typeToExtend));
        return node;
    }

    getNoCreate<TSource = any>(extendedType: string, which: 'all' | 'noDirect' | 'none'): InversifyExtensibleNode<TSource, TContext>[] {
        if (which === 'none')
            return [];
        const ret = which === 'noDirect'
            ? []
            : [this.nodes.get(extendedType)];
        for (const p of this.parents)
            ret.push(...p.getNoCreate(extendedType, 'all'));
        for (const q of ['query', 'mutation', 'subscription']) {
            if (this[q].typeName === extendedType) {
                for (const p of this.parents)
                    ret.push(p[q]);
            }
        }
        return ret.filter(x => !!x);
    }

    concat(...otherSchema: this[]): this {
        this.parents.push(...otherSchema);
        return this;
    }

    build(): GraphQLSchema {

        const that = this;
        class Temp extends InversifySchemaBuilder {
            
            @inject(TypeCache) protected builders: TypeCache;

            schema(): InversifySchemaConfig {
                return {
                    query:  that.query.buildType(),
                    mutation: that.mutation.buildType(),
                    subscription:  that.subscription.buildType(),
                }
            }
        }
        return inversifySchema(this.container, Temp);
    }
}

export function extensibleSchema<TContext = any>(name: string, container: Container): IInversifyExtensibleSchema<TContext> {
    return new InversifyExtensibleSchema(name, container);
}