import * as inv from 'inversify';
import * as gql from 'graphql';
import { InversifyObjectTypeBuilder } from './object-builder';
import { InversifyObjectConfig } from '.';
import { named } from './utils';
import { InversifyBuilder } from './interfaces';

/**
 * Creates a GraphQL list of an inversify type
 * @param ctor The type builder to make a list of
 */
export function InversifyList<TSource, TContext>(ctor: inv.interfaces.Newable<InversifyBuilder<TSource, TContext>>)
    : inv.interfaces.Newable<InversifyBuilder<TSource, TContext>> {

    class ThisList extends InversifyObjectTypeBuilder<TSource, TContext> {

        private builtList: gql.GraphQLList<any>;

        config(): InversifyObjectConfig<TSource, TContext> {
            throw new Error('Invalid operation');
        }

        build(): any {
            if (this.builtList)
                return this.builtList;
            const type = this.builders.get(ctor).build();
            return this.builtList = new gql.GraphQLList(type);
        }
    }

    return named(ThisList, `List(${ctor.name})`);
}