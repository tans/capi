package server

import "net/http"

func (s *Server) publicBrand(w http.ResponseWriter, r *http.Request) {
	settings, err := s.readStoredPricing(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settings.Brand)
}
