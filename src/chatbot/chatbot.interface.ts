import { WithId } from 'mongodb'

export interface QztWzt extends WithId<Document> {
  number: string,
  english: string,
  chinese: string,
  embedding: number[],
  source: string
}
