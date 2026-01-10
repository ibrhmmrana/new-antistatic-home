export interface Prediction {
  place_id: string;
  primary_text: string;
  secondary_text: string;
}

export interface AutocompleteResponse {
  predictions: Prediction[];
}

export interface SelectedPlace {
  place_id: string;
  primary_text: string;
  secondary_text: string;
}

