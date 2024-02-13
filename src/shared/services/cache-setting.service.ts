import { Injectable } from '@nestjs/common';

@Injectable()
export class CacheSettingService {
  private dict = {};

  /**
   * Associates the specified value with the specified key in this map. If the map previously contained a mapping for the key, the old value is replaced.
   * @method
   */
  set(key: string, value: any) {
    this.dict[key] = value;
  }

  /**
   * Returns the value to which the specified key is mapped, or null if this map contains no mapping for the key.
   * @method
   */
  get(key: string) {
    return this.dict[key];
  }

  /**
   * Returns all the map values.
   * @method
   */
  getAll() {
    return this.dict;
  }

  /**
   * Removes the mapping for the specified key from this map if present.
   * @method
   */
  remove(key: string) {
    delete this.dict[key];
  }

  /**
   * Removes all of the mappings from this map. The map will be empty after this call returns.
   * @method
   */
  clear() {
    this.dict = {};
  }

  /**
   * Returns true if this map contains no key-value mappings.
   * @method
   */
  isEmpty() {
    return Object.keys(this.dict).length == 0;
  }

  /**
   * Returns the number of key-value mappings in this map.
   * @method
   */
  size() {
    return Object.keys(this.dict).length;
  }
}
