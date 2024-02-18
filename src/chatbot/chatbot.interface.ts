import { WithId } from 'mongodb'

export interface Data extends WithId<Document> {
  userId: string,
  logs: { [key: string]: string[] }[]
}

export interface QztWzt extends WithId<Document> {
  number: string,
  english: string,
  chinese: string,
  embedding: number[],
  source: string
}
